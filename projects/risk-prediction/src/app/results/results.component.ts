import {AfterViewInit, Component, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import { Router } from '@angular/router';
import {Chart, ChartData, ChartOptions, LegendItem} from "chart.js";
import {CdsHooksService} from "cds-hooks";
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {MenuService} from "../menu.service";
import {beeswarmAssetUrl, LocalPlotResponse} from "./llm-models";
import {ChatbotComponent} from "../chatbot/chatbot.component";

interface ShapFeature {
  name: string;
  value: number;
}

interface DiseaseRisk {
  diseaseId: string;
  disease: string;
  riskScore: number;
  shapFeatures: ShapFeature[];
  expanded: boolean;
  baseline: number;
}

interface SummaryItem {
  primary: string;
  secondary?: string;
  date?: string;
  source?: string;
  linkLabel?: string;  // "Show SHAP Details"
  linkHref?: string;   // Will use this to store disease index for lookup
  diseaseIndex?: number; // Store index to find disease
}

@Component({
  selector: 'app-results',
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss']
})
export class ResultsComponent implements OnInit, OnDestroy, AfterViewInit {
  /** Explanation boxes (beeswarm and waterfall of every disease); their explanations are requested one disease at a time */
  @ViewChildren(ChatbotComponent) chatbots!: QueryList<ChatbotComponent>;
  /** diseases the user expanded, explained before the others */
  private explanationPriority: string[] = [];
  private explanationQueueRunning = false;
  private destroyed = false;


  diseases: DiseaseRisk[] = [];
  overallRiskScore: number = 0;
  loading: boolean = true;
  error: string | null = null;

  // Summary panel items
  highRiskItems: SummaryItem[] = [];
  moderateRiskItems: SummaryItem[] = [];
  lowRiskItems: SummaryItem[] = [];

  // Track which disease SHAP is showing
  selectedDiseaseForShap: DiseaseRisk | null = null;
  allItems: SummaryItem[] = [];
  chartData: ChartData|undefined;
  chartOptions: ChartOptions | undefined = {
    aspectRatio: 1.25,
    plugins: {
      tooltip: {
        backgroundColor: 'rgba(144, 144, 255, 0.5)',
      },
      legend: {
        position: 'bottom'
      }
    }
  };
  waterfallChartData: {[diseaseId: string]: ChartData} = {}
  waterfallChartOptions: ChartOptions = {
    aspectRatio: 1,
    indexAxis: 'y', // <-- makes it horizontal
    backgroundColor: (ctx: any) => ctx.raw >= 0 ? '#ff0051' : '#56b2fc',
    hoverBackgroundColor: (ctx: any) => ctx.raw >= 0 ? '#b1033b' : '#018bfb',
    borderColor: (ctx: any) => ctx.raw >= 0 ? '#b1033b' : '#018bfb',
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          generateLabels(chart: Chart): LegendItem[] {
            return [
              {
                text: 'Increasing Factors',
                fillStyle: '#ff0051',
                strokeStyle: '#b1033b'
              },
              {
                text: 'Decreasing Factors',
                fillStyle: '#56b2fc',
                strokeStyle: '#018bfb'
              }
            ];
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true
      }
    }
  };
  llmSessionId: string|undefined;
  chat: {[diseaseId: string]: boolean} = {};
  riskObservations: { [diseaseId: string]: fhir4.Observation } = {};
  localPlotResponse!: LocalPlotResponse;

  /** Beeswarm image of the disease for the patient's model stratum */
  beeswarmUrl(disease: string): string {
    return beeswarmAssetUrl(this.localPlotResponse?.resolved_stratum, disease);
  }

  constructor(private router: Router, private sof: SmartOnFhirService,
              private cds: CdsHooksService<fhir4.Resource>, private menuService: MenuService) {}

  ngOnInit() {
    this.loadResults();
    this.loading = false;
  }

  ngAfterViewInit() {
    this.chatbots.changes.subscribe(() => this.runExplanationQueue());
    this.runExplanationQueue();
  }

  /** The user expanded a disease: explain it next (after the disease currently being explained) */
  prioritizeExplanation(disease: string) {
    this.explanationPriority = [disease, ...this.explanationPriority.filter(d => d !== disease)];
  }

  /**
   * Request the LLM explanations disease by disease, in the order of the risk (or the order the user expanded them):
   * the next disease starts when both explanations (beeswarm and waterfall) of the previous one are received.
   */
  private async runExplanationQueue() {
    if (this.explanationQueueRunning || !this.chatbots?.length) return;
    this.explanationQueueRunning = true;
    try {
      while (!this.destroyed) {
        const pending = (disease: string) => this.chatbots.filter(c => c.disease === disease && !c.started);
        const order = [...this.explanationPriority, ...this.diseases.map(d => d.disease)];
        const next = order.find(disease => pending(disease).length);
        if (!next) break;
        await Promise.all(pending(next).map(chatbot => chatbot.init()));
      }
    } finally {
      this.explanationQueueRunning = false;
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.menuService.menuItems = []
  }

  private loadResults() {
    try {
      const saved = localStorage.getItem('questionnaire_results');
      this.llmSessionId = sessionStorage.getItem('llm_session_id') || undefined;
      if (saved) {
        const cards = JSON.parse(saved);
        this.processLocalPlotCards(cards);
        this.prepareSummaryPanels();
      } else {
        this.error = 'No prediction data available. Please complete the questionnaire first.';
      }
    } catch (e) {
      console.error('Error loading results:', e);
      this.error = 'Error loading prediction results';
    }
  }

  private processLocalPlotCards(cards: any[]) {
    try {
      const diseases: DiseaseRisk[] = [];
      this.localPlotResponse = <LocalPlotResponse>JSON.parse(cards[0].detail.replaceAll("&quot;", '"'))
      this.localPlotResponse.results.forEach(result => {
        const disease = result.disease;
        const riskScore = result.prediction.risk_score || 0;

        const shapFeatures: ShapFeature[] = [
          ...result.plots['waterfall'].waterfall_data.top_positive_contributors,
          ...result.plots['waterfall'].waterfall_data.top_negative_contributors,
        ].map(contributor => ({
          name: contributor.display_name,
          value: contributor.shap_value
        }));

        diseases.push({
          diseaseId: disease.replaceAll(" ", "_"),
          disease,
          riskScore,
          shapFeatures,
          expanded: false,
          baseline: result.plots['waterfall'].waterfall_data.baseline_value || 0
        });

        this.diseases = diseases.sort((a, b) => b.riskScore - a.riskScore);
        this.diseases.forEach(disease => {
          this.waterfallChartData[disease.disease] = this.getWaterfallChartData(disease)
        })
        setTimeout(() => {
          this.menuService.menuItems.splice(0, this.menuService.menuItems.length, ...[{
            label: 'Diseases',
            header: true
          }, ...this.diseases.map(disease => ({
            label: disease.disease,
            callback: () => {
              const accordionBtn = document.getElementById('accordion-btn-' + disease.diseaseId)
              accordionBtn?.scrollIntoView({ behavior: 'smooth' });
              if (accordionBtn?.classList.contains('collapsed')) {
                accordionBtn?.click()
              }
            }
          }))])
        })

        if (this.diseases.length > 0) {
          const top3 = this.diseases.slice(0, 3);
          this.overallRiskScore = top3.reduce((sum, d) => sum + d.riskScore, 0) / top3.length;
        }
      })
    } catch (err) {
      console.error(err)
      this.error = 'Error processing prediction results';
    }
  }

  private prepareSummaryPanels() {
    const high: SummaryItem[] = [];
    const moderate: SummaryItem[] = [];
    const low: SummaryItem[] = [];

    this.diseases.forEach((disease, index) => {
      const riskPercent = (disease.riskScore * 100).toFixed(1) + '%';

      const topFeatures = disease.shapFeatures
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 3)
        .map(f => {
          const impact = f.value > 0 ? '↑' : '↓';
          const cleanName = f.name.replace(' 0.0', '').trim();
          return `${cleanName} ${impact}`;
        })
        .join(', ');

      const item: SummaryItem = {
        primary: disease.disease,
        secondary: topFeatures || 'No contributing factors identified',
        date: riskPercent,
        source: this.getRiskLevelText(disease.riskScore),
        linkLabel: disease.shapFeatures.length > 0 ? 'Show SHAP Details' : undefined,
        linkHref: disease.shapFeatures.length > 0 ? `#disease-${index}` : undefined,
        diseaseIndex: index
      };

      if (disease.riskScore >= 0.15) {
        high.push(item);
      } else if (disease.riskScore >= 0.05) {
        moderate.push(item);
      } else {
        low.push(item);
      }
    });

    this.highRiskItems = high;
    this.moderateRiskItems = moderate;
    this.lowRiskItems = low;
    this.allItems = [...this.highRiskItems, ...this.moderateRiskItems, ...this.lowRiskItems];
    this.chartData = {
      labels: this.diseases.map(disease => disease.disease),
      datasets: [{
        label: 'Disease Risk (%)',
        data: this.diseases.map(disease => disease.riskScore * 100)
      }]
    }
  }

  /**
   * Show SHAP details for a specific disease
   * Called when user clicks "Show SHAP Details" link in summary panel
   */
  showShapDetails(diseaseIndex: number, event?: Event) {
    if (event) {
      event.preventDefault();
    }

    const disease = this.diseases[diseaseIndex];
    if (disease) {
      this.selectedDiseaseForShap = disease;
      // Scroll to SHAP modal
      setTimeout(() => {
        document.getElementById('shap-modal')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  /**
   * Close SHAP details
   */
  closeShapDetails() {
    this.selectedDiseaseForShap = null;
  }

  getRiskLevelClass(riskScore: number): string {
    if (riskScore >= 0.30) return 'risk-critical';
    if (riskScore >= 0.15) return 'risk-high';
    if (riskScore >= 0.05) return 'risk-moderate';
    return 'risk-low';
  }

  getRiskLevelColor(riskScore: number): string {
    if (riskScore >= 0.15) return 'var(--bs-danger)';
    if (riskScore >= 0.05) return 'var(--bs-warning)';
    return 'var(--bs-info)';
  }

  getRiskLevelText(riskScore: number): string {
    if (riskScore >= 0.30) return 'Very High Risk';
    if (riskScore >= 0.15) return 'High Risk';
    if (riskScore >= 0.05) return 'Moderate Risk';
    return 'Low Risk';
  }

  formatPercent(value: number): string {
    return (value * 100).toFixed(2) + '%';
  }

  getTopShapFeatures(features: ShapFeature[], n: number = 10): ShapFeature[] {
    return [...features]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, n);
  }

  getShapImpact(value: number): string {
    return value > 0 ? '↑ Increases' : '↓ Decreases';
  }

  getShapImpactClass(value: number): string {
    return value > 0 ? 'shap-positive' : 'shap-negative';
  }

  /** Back to the disease selection (same saved questionnaire response) */
  changeDiseases() {
    this.router.navigate(['/diseases']);
  }

  goBack() {
    this.router.navigate(['/form']);
  }

  getWaterfallChartData(disease: DiseaseRisk): ChartData {
    const features = this.getTopShapFeatures(disease.shapFeatures, 10)
    return {
      labels: features.map(feature => feature.name),
      datasets: [{
        base: disease.baseline,
        label: 'Contribution',
        data: features.map(feature => feature.value)
      }]
    };
  }

  private async getShapExplanation(resource: fhir4.Bundle<fhir4.Observation>) {
    const patient = await this.sof.getPatient()
    const client = await this.sof.getClient();
    this.cds.callService({
      language: 'en',
      serviceId: 'shap_explain',
      // The CDS services read the patient's data with the app's FHIR access token
      fhirServer: client?.state?.serverUrl,
      fhirAuthorization: client?.state?.tokenResponse,
      context: {
        patientId: patient?.id,
      },
      prefetch: {
        patient,
        risk_predictions: resource
      }
    }).then(response => {
      this.llmSessionId = response.cards?.at(0)?.summary
      sessionStorage.setItem('llm_session_id', <string>this.llmSessionId)
    }, console.error)
  }

}
