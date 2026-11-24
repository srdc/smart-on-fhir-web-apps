import {AfterViewInit, Component, OnDestroy, OnInit, QueryList, ViewChildren} from '@angular/core';
import { Router } from '@angular/router';
import {Chart, ChartData, ChartOptions, LegendItem} from "chart.js";
import {CdsHooksService} from "cds-hooks";
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {MenuService} from "../menu.service";
import {beeswarmAssetUrl, LocalPlotResponse} from "./llm-models";
import {ChatbotComponent} from "../chatbot/chatbot.component";
import {environment} from "../../environments/environment";
import annotationPlugin from 'chartjs-plugin-annotation';

const waterfallDirectionPlugin = {
  id: 'waterfallDirectionPlugin',

  afterDatasetsDraw(chart: any) {
    const dataset = chart.data.datasets[0] as any;

    if (!dataset?.pointTypes) {
      return;
    }

    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;

    if (!meta?.data) {
      return;
    }

    ctx.save();

    meta.data.forEach((bar: any, index: number) => {
      const raw = dataset.data[index];

      if (!Array.isArray(raw) || raw.length !== 2) {
        return;
      }

      const [start, end] = raw;

      if (start === end) {
        return;
      }

      const direction = end > start ? '→' : '←';

      const props = bar.getProps(
        ['x', 'base', 'y'],
        true
      );

      const left = Math.min(props.x, props.base);
      const right = Math.max(props.x, props.base);
      const width = right - left;

      let arrowX: number;

      if (width >= 24) {
        arrowX = left + width / 2;
      } else {
        arrowX = end > start
          ? right + 8
          : left - 8;
      }

      ctx.font = '700 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle =
        width >= 24
          ? 'rgba(255, 255, 255, 0.95)'
          : '#495057';

      ctx.fillText(
        direction,
        arrowX,
        props.y
      );
    });

    ctx.restore();
  }
};

Chart.register(
  annotationPlugin,
  waterfallDirectionPlugin
);

interface ShapFeature {
  name: string;
  value: number;
  displayContribution?: number;
}

interface DiseaseRisk {
  diseaseId: string;
  disease: string;
  riskScore: number;
  shapFeatures: ShapFeature[];
  expanded: boolean;

  baselineValue: number;
  finalPrediction: number;
  otherFeaturesContribution: number;
  numOtherFeatures: number;
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

function formatDisplayPercent(value: number): string {
  const percent = value * 100;

  const maximumFractionDigits =
    Math.abs(percent) >= 10 ? 1 :
    Math.abs(percent) >= 1 ? 2 : 3;

  return new Intl.NumberFormat('en-GB', {
    maximumFractionDigits
  }).format(percent) + '%';
}

function formatSignedPercentagePoints(
  probabilityContribution: number
): string {
  const percentagePoints = probabilityContribution * 100;

  const maximumFractionDigits =
    Math.abs(percentagePoints) >= 10 ? 1 : 3;

  const magnitude = new Intl.NumberFormat('en-GB', {
    maximumFractionDigits
  }).format(Math.abs(percentagePoints));

  return `${percentagePoints >= 0 ? '+' : '-'}${magnitude} percentage points`;
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
  /** diseases shown in the radar chart, the predictions list, the details and the menu (all, or only the non-low ones) */
  visibleDiseases: DiseaseRisk[] = [];
  /** Hide the diseases with a risk of at most LOW_RISK_THRESHOLD */
  hideLowRisks = false;
  static readonly LOW_RISK_THRESHOLD = 0.01;
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
    // fills its box (.risk-chart-radar), whose height follows the screen
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        backgroundColor: 'rgba(144, 144, 255, 0.5)',
      },
      legend: {
        position: 'bottom'
      }
    }
  };
  /** Chart of the disease risks shown, the user switches between them */
  riskChartType: 'radar' | 'bar' = 'radar';
  /** The app's page in the dashboard: how well the models predict */
  readonly dashboardDetailsUrl = environment.riskPrediction.dashboardDetailsUrl;
  /** Colour of each disease (by diseaseId) in the bar chart and the disease details: a tone of the primary colour by its rank */
  diseaseColors: {[diseaseId: string]: string} = {};
  /** Same data as the radar chart, one horizontal bar per disease, from high risk to low */
  barChartData: ChartData<'bar'> | undefined;
  barChartOptions: ChartOptions<'bar'> = {
    // fills its box, whose height follows the number of bars (barChartHeight)
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => `${(ctx.raw as number).toFixed(1)}%` }
      }
    },
    scales: {
      x: { beginAtZero: true, title: { display: true, text: 'Disease Risk (%)' } },
      y: { ticks: { autoSkip: false } }
    }
  };
  /** Same bar thickness on every screen: a fixed height per bar, plus the x axis and its title */
  get barChartHeight(): number {
    return Math.max(this.visibleDiseases.length, 4) * 28 + 70;
  }
  waterfallChartData: {[diseaseId: string]: ChartData} = {}
  waterfallChartOptions: ChartOptions = {
    aspectRatio: 1.4,
    indexAxis: 'y',

    layout: {
      padding: {
        top: 32
      }
    },

    plugins: {
      tooltip: {
        callbacks: {
          title: (contexts: any[]) => {
            return contexts[0]?.label ?? '';
          },

          label: (context: any) => {
            const dataset = context.dataset as any;

            const contribution =
              dataset.contributions?.[context.dataIndex] ?? 0;

            const type =
              dataset.pointTypes?.[context.dataIndex];

            if (type === 'other') {
              return [
                `Risk contribution: ${formatSignedPercentagePoints(contribution)}`,
                `${dataset.numOtherFeatures} other features combined`
              ];
            }

            return [
              `Risk contribution: ${formatSignedPercentagePoints(contribution)}`
            ];
          }
        }
      },

      legend: {
        display: true,
        position: 'bottom',

        labels: {
          generateLabels(chart: Chart): LegendItem[] {
            return [
              {
                text: 'Increases prediction',
                fillStyle: '#0d6efd',
                strokeStyle: '#0d6efd'
              },
              {
                text: 'Decreases prediction',
                fillStyle: '#fd7e14',
                strokeStyle: '#fd7e14'
              },
              {
                text: 'Other features',
                fillStyle: '#adb5bd',
                strokeStyle: '#adb5bd'
              }
            ];
          }
        }
      },

      annotation: {
        clip: false,

        annotations: {
          baselineLine: {
            type: 'line',

            xMin: (ctx: any) =>
              (ctx.chart.data.datasets[0] as any).baselineValue,

            xMax: (ctx: any) =>
              (ctx.chart.data.datasets[0] as any).baselineValue,

            borderColor: '#6c757d',
            borderWidth: 2,
            borderDash: [6, 6],

            label: {
              display: true,

              content: (ctx: any) => {
                const value =
                  (ctx.chart.data.datasets[0] as any).baselineValue;

                return `Baseline ${formatDisplayPercent(value)}`;
              },

              position: 'start',
              backgroundColor: 'rgba(255,255,255,0.9)',
              color: '#495057'
            }
          },

          finalPredictionLine: {
            type: 'line',

            xMin: (ctx: any) =>
              (ctx.chart.data.datasets[0] as any).finalPrediction,

            xMax: (ctx: any) =>
              (ctx.chart.data.datasets[0] as any).finalPrediction,

            borderColor: '#212529',
            borderWidth: 2,

            label: {
              display: true,

              content: (ctx: any) => {
                const value =
                  (ctx.chart.data.datasets[0] as any).finalPrediction;

                return `Patient prediction ${formatDisplayPercent(value)}`;
              },

              position: 'end',
              yAdjust: -24,
              backgroundColor: 'rgba(255,255,255,0.9)',
              color: '#212529'
            }
          }
        }
      }
    },

    backgroundColor: (ctx: any) => {
      const dataset = ctx.dataset as any;

      const type =
        dataset.pointTypes?.[ctx.dataIndex];

      const contribution =
        dataset.contributions?.[ctx.dataIndex];

      if (type === 'other') {
        return '#adb5bd';
      }

      return contribution >= 0
        ? '#0d6efd'
        : '#fd7e14';
    },

    borderColor: (ctx: any) => {
      const dataset = ctx.dataset as any;

      const type =
        dataset.pointTypes?.[ctx.dataIndex];

      const contribution =
        dataset.contributions?.[ctx.dataIndex];

      if (type === 'other') {
        return '#adb5bd';
      }

      return contribution >= 0
        ? '#0d6efd'
        : '#fd7e14';
    },

    scales: {
      x: {
        beginAtZero: false,

        ticks: {
          callback: (value: any) =>
            (Number(value) * 100).toFixed(2) + '%'
        },

        title: {
          display: true,
          text: 'Predicted risk'
        }
      },

      y: {
        ticks: {
          autoSkip: false
        }
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

        const waterfallData =
        result.plots['waterfall'].waterfall_data;

        const baselineValue =
          waterfallData.baseline_value;

        const finalPrediction =
          waterfallData.final_prediction;

        const otherFeaturesContribution =
          waterfallData.other_features_contribution ?? 0;

        const numOtherFeatures =
          waterfallData.num_other_features ?? 0;

        const shapFeatures: ShapFeature[] = [
          ...waterfallData.top_positive_contributors,
          ...waterfallData.top_negative_contributors,
        ].map(contributor => ({
          name: contributor.display_name,
          value: contributor.shap_value,
          displayContribution: contributor.display_contribution
        }));

        diseases.push({
          diseaseId: disease.replaceAll(" ", "_"),
          disease,
          riskScore,
          shapFeatures,
          expanded: false,
          baselineValue,
          finalPrediction,
          otherFeaturesContribution,
          numOtherFeatures
        });

        this.diseases = diseases.sort((a, b) => b.riskScore - a.riskScore);
        this.diseases.forEach(disease => {
          this.waterfallChartData[disease.disease] = this.getWaterfallChartData(disease)
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
    this.applyRiskFilter();
  }

  isHidden(disease: DiseaseRisk): boolean {
    return this.hideLowRisks && disease.riskScore <= ResultsComponent.LOW_RISK_THRESHOLD;
  }

  setHideLowRisks(hide: boolean) {
    this.hideLowRisks = hide;
    this.applyRiskFilter();
  }

  /** Update the radar chart, the predictions list and the menu with the diseases passing the filter */
  private applyRiskFilter() {
    this.visibleDiseases = this.diseases.filter(disease => !this.isHidden(disease));
    this.chartData = {
      labels: this.visibleDiseases.map(disease => disease.disease),
      datasets: [{
        label: 'Disease Risk (%)',
        data: this.visibleDiseases.map(disease => disease.riskScore * 100)
      }]
    }
    // no risk level thresholds: the primary colour, slightly lighter from the top (highest risk) to the bottom
    const primaryRgb = getComputedStyle(document.documentElement).getPropertyValue('--bs-primary-rgb').trim() || '13, 110, 253';
    const count = this.visibleDiseases.length;
    const colors = this.visibleDiseases.map((_, i) =>
      `rgba(${primaryRgb}, ${(1 - 0.45 * (count > 1 ? i / (count - 1) : 0)).toFixed(2)})`);
    this.visibleDiseases.forEach((disease, i) => this.diseaseColors[disease.diseaseId] = colors[i]);
    this.barChartData = {
      labels: this.visibleDiseases.map(disease => disease.disease),
      datasets: [{
        label: 'Disease Risk (%)',
        data: this.visibleDiseases.map(disease => disease.riskScore * 100),
        backgroundColor: colors,
        borderColor: colors
      }]
    }
    setTimeout(() => {
      this.menuService.menuItems.splice(0, this.menuService.menuItems.length, ...[{
        label: 'Diseases',
        header: true
      }, ...this.visibleDiseases.map(disease => ({
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

  /** On to intervention planning: the modifiable risk factors and the interventions to suggest to the patient */
  manageInterventions() {
    this.router.navigate(['/interventions']);
  }

  getWaterfallChartData(disease: DiseaseRisk): ChartData {
    const features = [...disease.shapFeatures]
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const labels: string[] = [];
    const data: [number, number][] = [];
    const contributions: number[] = [];
    const pointTypes: string[] = [];

    let currentValue = disease.baselineValue;

    features.forEach(feature => {
      const start = currentValue;

      // Use sequential percentage-point contributions when available.
      // Otherwise, use SHAP values from the current probability-scale
      // backend response.
      const contribution = feature.displayContribution === undefined
        ? feature.value
        : feature.displayContribution / 100;

      const end = start + contribution;

      labels.push(feature.name);
      data.push([start, end]);
      contributions.push(contribution);
      pointTypes.push('feature');

      currentValue = end;
    });

    if (disease.numOtherFeatures > 0) {
      const start = currentValue;
      const end = start + disease.otherFeaturesContribution;

      labels.push('Other features');
      data.push([start, end]);
      contributions.push(disease.otherFeaturesContribution);
      pointTypes.push('other');

      currentValue = end;
    }

    return {
      labels,
      datasets: [{
        label: 'Prediction',
        data,
        contributions,
        pointTypes,
        baselineValue: disease.baselineValue,
        finalPrediction: disease.finalPrediction,
        numOtherFeatures: disease.numOtherFeatures
      } as any]
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
