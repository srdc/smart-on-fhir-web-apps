import {Component, EventEmitter, Input, OnInit, Output, SecurityContext} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {CdsHooksService} from "cds-hooks";
import {Router} from "@angular/router";
import {DomSanitizer} from "@angular/platform-browser";
import MarkdownIt from 'markdown-it';
import {beeswarmAssetUrl, LocalPlotResponse} from "../results/llm-models";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";

const md = MarkdownIt()

@Component({
  selector: 'rp-chatbot',
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss'
})
export class ChatbotComponent implements OnInit {
  @Input() sessionId: string|undefined;
  @Input() disease: string|undefined;
  @Input() chart!: 'beeswarm'|'waterfall';
  @Input() context: string[] = [];
  @Input() riskPredictionObservation!: fhir4.Observation;
  @Input() runOnInit: boolean|undefined = true;
  @Output() close: EventEmitter<void> = new EventEmitter<void>();

  private patient: fhir4.Patient | undefined;
  possibleNextQuestions: string[] = [];

  history: { user: boolean, text: string|null, error?: boolean }[] = []
  loading: boolean = false;
  @Input() localPlotResponse!: LocalPlotResponse;
  summary: boolean = true;
  increasingFactors: string[]|undefined;
  decreasingFactors: string[]|undefined;
  /** beeswarm (global) explanations: most important features and their directional patterns */
  importantFeatures: string[]|undefined;
  directionalPatterns: string[]|undefined;
  plotSummary: string|undefined;
  plotOverview: string|undefined;

  constructor(private router: Router, private sof: SmartOnFhirService, private http: HttpClient,
              private cds: CdsHooksService<fhir4.Resource>, private sanitizer: DomSanitizer) {}

  private patientReady: Promise<void> | undefined;
  private initPromise: Promise<void> | undefined;

  async ngOnInit() {
    this.loading = true;
    this.patientReady = this.sof.getPatient().then((patient: fhir4.Patient | undefined) => { this.patient = patient });
    await this.patientReady;
    if (this.runOnInit) this.init()
  }

  /** true once the explanation has been requested */
  get started(): boolean {
    return !!this.initPromise;
  }

  /**
   * Request the explanation of the chart (only once; later calls return the same promise).
   * Resolves when the answer, or an error, is received.
   */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.requestExplanation().catch(err => {
        // e.g. the beeswarm summary could not be loaded
        console.error(err);
        this.loading = false;
        this.history.push({
          user: false,
          error: true,
          text: this.sanitizer.sanitize(SecurityContext.HTML, 'Something went wrong, please try again...')
        })
      });
    }
    return this.initPromise;
  }

  private async requestExplanation(): Promise<void> {
    await this.patientReady;
    const client = await this.sof.getClient();
    return this.cds.callService({
      language: 'en',
      serviceId: 'shap_explain',
      // The CDS services read the patient's data with the app's FHIR access token
      fhirServer: client?.state?.serverUrl,
      fhirAuthorization: client?.state?.tokenResponse,
      context: {
        patientId: this.patient?.id,
        sessionId: this.sessionId,
        riskPredictions: this.chart === 'beeswarm' ? await firstValueFrom(this.http.get(beeswarmAssetUrl(this.localPlotResponse?.resolved_stratum, this.disease ?? '', 'json')))
          : this.localPlotResponse.results.find(result => result.disease === this.disease)?.plots['waterfall']
      },
      prefetch: {
        patient: this.patient,
        risk_predictions: { resourceType: 'Bundle', type: 'searchset', total: 1, entry: [{
            resource: this.riskPredictionObservation,
            search: { mode: 'match' }
          }] }
      }
    }).then(response => {
      console.log(response)
      this.possibleNextQuestions = response.cards?.at(0)?.suggestions?.filter((suggestion: any) => suggestion.uuid.startsWith("suggested-question")).map((suggestion: any) => suggestion.label) || []
      this.increasingFactors = JSON.parse(response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'increasing-factors')?.label || '[]')
      this.decreasingFactors = JSON.parse(response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'decreasing-factors')?.label || '[]')
      this.importantFeatures = JSON.parse(response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'important-features')?.label || '[]')
      this.directionalPatterns = JSON.parse(response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'directional-patterns')?.label || '[]')
      this.plotOverview = response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'overview')?.label
      this.plotSummary = response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'summary')?.label
      this.sessionId = response.cards?.at(0)?.summary
      console.log(this.possibleNextQuestions)
    }, err => {
      console.error(err);
      this.history.push({
        user: false,
        error: true,
        text: this.sanitizer.sanitize(SecurityContext.HTML, 'Something went wrong, please try again...')
      })
    }).finally(() => this.loading = false)
  }

  async ask(question: string, scrollDiv?: HTMLElement) {
    this.possibleNextQuestions = []
    this.history.push({user: true, text: this.sanitizer.sanitize(SecurityContext.HTML, question)})
    this.loading = true;
    const client = await this.sof.getClient();
    this.cds.callService({
      language: 'en',
      serviceId: 'ask_llm',
      // The CDS services read the patient's data with the app's FHIR access token
      fhirServer: client?.state?.serverUrl,
      fhirAuthorization: client?.state?.tokenResponse,
      context: {
        patientId: this.patient?.id,
        sessionId: this.sessionId,
        disease: this.disease,
        chartType: this.getExplaination(this.chart),
        question
      },
      prefetch: {
        patient: this.patient
      }
    }).then(response => {
      this.history.push({
        user: false,
        text: this.sanitizer.sanitize(SecurityContext.HTML, md.render(response.cards?.at(0)?.detail))
      })
      this.possibleNextQuestions = response.cards?.at(0)?.suggestions?.map((suggestion: any) => suggestion.label) || []
      console.log(this.history, this.possibleNextQuestions)
    }, err => {
      console.error(err);
      this.history.push({
        user: false,
        text: this.sanitizer.sanitize(SecurityContext.HTML, 'Something went wrong, please try again...')
      })
    }).finally(() => {
      this.loading = false
      if (scrollDiv) {
        setTimeout(() => {
          scrollDiv.scrollTo({
            top: scrollDiv.scrollHeight,
            behavior: 'smooth'
          })
        }, 100)
      }
    })
  }

  private getExplaination(chart: string | undefined) {
    switch (chart) {
      case 'waterfall':
        return `[Waterfall Chart, y-axis: SHAP feature names, x-axis: numeric SHAP values: negative values are shown as orange bars, positive values are shown as blue bars ]`
      default:
        return chart;
    }
  }
}
