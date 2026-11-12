import {Component, EventEmitter, Input, OnInit, Output, SecurityContext} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {CdsHooksService} from "cds-hooks";
import {Router} from "@angular/router";
import {DomSanitizer} from "@angular/platform-browser";
import MarkdownIt from 'markdown-it';
import {BeeswarmData, LocalPlotResponse, Plot} from "../results/llm-models";
import {StudyConversationMessage, StudyConversationService, StudyConversationState} from '../study/services/study-conversation.service';

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
  @Input() stratum!: string;
  @Input() context: string[] = [];
  @Input() riskPredictionObservation!: fhir4.Observation;
  /** Frozen Study supplies the authoritative patient instead of SMART context. */
  @Input() patientProfile?: fhir4.Patient;
  @Input() studyConversationCaseId?: string;
  @Input() primaryStudyDisease?: string;
  @Input() studyCaseContentHash?: string;
  @Input() studyMode: boolean = false;
  @Input() runOnInit: boolean|undefined = true;
  @Input() plotPayload: BeeswarmData|undefined;
  @Output() close: EventEmitter<void> = new EventEmitter<void>();

  private patient: fhir4.Patient | undefined;
  possibleNextQuestions: string[] = [];

  history: { user: boolean, text: string|null, error?: boolean }[] = []
  loading: boolean = false;
  @Input() localPlotResponse!: LocalPlotResponse;
  summary: boolean = true;
  increasingFactors: string[]|undefined;
  decreasingFactors: string[]|undefined;
  plotSummary: string|undefined;
  plotOverview: string|undefined;
  confidenceAndCaveats: string[] | undefined;
  private persistedMessages: StudyConversationMessage[] = [];
  private suggestedQuestionIds: Record<string, string> = {};

  constructor(private router: Router, private sof: SmartOnFhirService,
              private cds: CdsHooksService<fhir4.Resource>, private sanitizer: DomSanitizer,
              private studyConversation: StudyConversationService) {}

  async ngOnInit() {
    this.patient = this.patientProfile ?? await this.sof.getPatient()
    this.loading = true;
    if (!this.runOnInit) {
      this.loading = false;
      return;
    }
    if (this.isFrozenStudyTarget()) {
      this.initializeFrozenStudyConversation();
    } else if (this.isDynamicStudyDisease()) {
      this.initializeDynamicStudyConversation();
    } else if (this.studyConversationCaseId) {
      this.studyConversation.get(this.studyConversationCaseId, this.disease || '', this.chart).subscribe({
        next: state => {
          // Conversations are stored per case/chart for compatibility with the
          // study API. Never hydrate a chatbot with another disease's state.
          if (!state || state.disease !== this.disease || !this.hydrateConversation(state)) {
            this.init();
          }
        },
        error: error => {
          console.error('Study conversation restore failed', error);
          this.loading = false;
          this.history.push({
            user: false,
            error: true,
            text: this.sanitizer.sanitize(SecurityContext.HTML, 'The saved Study conversation could not be loaded. Please try again.')
          });
        }
      });
    } else {
      this.init();
    }
  }

  private initializeFrozenStudyConversation(): void {
    const waterfallPayload = this.localPlotResponse?.results.find(
      result => result.disease === this.disease
    )?.plots?.['waterfall'];
    if (!this.studyCaseContentHash || !waterfallPayload) {
      this.loading = false;
      this.history.push({
        user: false,
        error: true,
        text: this.sanitizer.sanitize(SecurityContext.HTML, 'The active Study case could not be verified safely. Please contact the study team.')
      });
      return;
    }
    this.studyConversation.initializeFrozen(
      this.studyConversationCaseId!, this.disease || '', this.studyCaseContentHash, waterfallPayload
    ).subscribe({
      next: state => {
        if (!this.hydrateConversation(state)) {
          this.history.push({
            user: false,
            error: true,
            text: this.sanitizer.sanitize(SecurityContext.HTML, 'The saved Study conversation is incompatible with the approved frozen content.')
          });
          this.loading = false;
        }
      },
      error: error => {
        console.error('Frozen Study conversation initialization failed', error);
        this.loading = false;
        this.history.push({
          user: false,
          error: true,
          text: this.sanitizer.sanitize(SecurityContext.HTML, 'The Study explanation could not be loaded safely. Please contact the study team.')
        });
      }
    });
  }

  private initializeDynamicStudyConversation(): void {
    const waterfallPayload = this.localPlotResponse?.results.find(
      result => result.disease === this.disease
    )?.plots?.['waterfall'];
    if (!this.studyCaseContentHash || !waterfallPayload) {
      this.loading = false;
      this.history.push({user: false, error: true, text: this.sanitizer.sanitize(
        SecurityContext.HTML, 'The active Study case could not be verified safely. Please contact the study team.'
      )});
      return;
    }
    this.studyConversation.initializeDynamic(
      this.studyConversationCaseId!, this.disease || '', this.studyCaseContentHash, waterfallPayload
    ).subscribe({
      next: state => this.hydrateConversation(state),
      error: error => {
        console.error('Dynamic Study conversation initialization failed', error);
        this.loading = false;
        this.history.push({user: false, error: true, text: this.sanitizer.sanitize(
          SecurityContext.HTML, 'The Study explanation could not be loaded safely. Please contact the study team.'
        )});
      }
    });
  }

  async init() {
    const originalPlotPayload: Plot | BeeswarmData | undefined = this.chart === 'beeswarm'
      ? this.plotPayload
      : this.localPlotResponse.results.find(
          result => result.disease === this.disease
        )?.plots['waterfall'];

    if (!originalPlotPayload) {
      throw new Error(`No ${this.chart} plot payload is available for ${this.disease}.`);
    }

    this.cds.callService({
      language: 'en',
      serviceId: 'shap_explain',
      context: {
        patientId: this.patient?.id,
        sessionId: this.sessionId,
        riskPredictions: originalPlotPayload
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
      this.suggestedQuestionIds = Object.fromEntries(
        (response.cards?.at(0)?.suggestions ?? [])
          .filter((suggestion: any) => suggestion.uuid?.startsWith('suggested-question'))
          .map((suggestion: any) => [suggestion.label, suggestion.uuid])
      );
      this.increasingFactors = JSON.parse(response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'increasing-factors')?.label || '[]')
      this.decreasingFactors = JSON.parse(response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'decreasing-factors')?.label || '[]')
      this.confidenceAndCaveats = JSON.parse(
        response.cards?.at(0)?.suggestions?.find(
          (suggestion: any) => suggestion.uuid === 'confidence'
        )?.label || '[]'
      );
      this.plotOverview = response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'overview')?.label
      this.plotSummary = response.cards?.at(0)?.suggestions?.find((suggestion: any) => suggestion.uuid === 'summary')?.label
      this.sessionId = response.cards?.at(0)?.summary
      this.persistConversation();
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

  ask(question: string, scrollDiv?: HTMLElement, source: 'suggested' | 'free_text' = 'free_text') {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;
    if (this.isFrozenStudyTarget()) {
      this.askFrozenStudyQuestion(normalizedQuestion, scrollDiv, source);
      return;
    }
    if (this.isDynamicStudyDisease()) {
      this.askDynamicStudyQuestion(normalizedQuestion, scrollDiv, source);
      return;
    }
    // Source is supplied by the initiating UI action. Do not infer it from
    // matching text: restored/dynamic suggestions share the same send path.
    const suggestedQuestionId = source === 'suggested'
      ? this.suggestedQuestionIds[normalizedQuestion]
      : undefined;
    this.possibleNextQuestions = []
    this.suggestedQuestionIds = {};
    this.history.push({user: true, text: this.sanitizer.sanitize(SecurityContext.HTML, normalizedQuestion)})
    this.loading = true;
    const requestId = this.newRequestId();
    this.cds.callService({
      language: 'en',
      serviceId: 'ask_llm',
      context: {
        patientId: this.patient?.id,
        sessionId: this.sessionId,
        disease: this.disease,
        chartType: this.getExplaination(this.chart),
      question: normalizedQuestion,
      requestId
      },
      prefetch: {
        patient: this.patient
      }
    }).then(response => {
      this.history.push({
        user: false,
        text: this.renderAssistantMessage(response.cards?.at(0)?.detail || '')
      })
      this.possibleNextQuestions = response.cards?.at(0)?.suggestions?.map((suggestion: any) => suggestion.label) || []
      this.suggestedQuestionIds = Object.fromEntries(
        (response.cards?.at(0)?.suggestions ?? []).map((suggestion: any) => [suggestion.label, suggestion.uuid])
      );
      const answerText = response.cards?.at(0)?.detail || '';
      this.persistedMessages.push({
        role: 'user',
        kind: source === 'suggested' ? 'user_suggested' : 'user_free_text',
        text: normalizedQuestion,
        timestamp: new Date().toISOString(),
        requestId,
        ...(suggestedQuestionId ? {suggestedQuestionId} : {})
      });
      this.persistedMessages.push({
        role: 'assistant',
        kind: 'assistant_answer',
        text: answerText,
        timestamp: new Date().toISOString(),
        requestId
      });
      this.persistConversation();
      if (this.studyConversationCaseId) {
        this.studyConversation.logInteraction(this.studyConversationCaseId, {
          primaryStudyDisease: this.primaryStudyDisease || '',
          disease: this.disease || '',
          chartType: this.chart,
          questionSource: source,
          questionText: normalizedQuestion,
          answerText,
          ...(suggestedQuestionId ? {suggestedQuestionId} : {}),
          llmSessionId: this.sessionId,
          requestId,
          clientTimestamp: new Date().toISOString(),
          eventId: this.newRequestId()
        }).subscribe({error: error => console.error('Study interaction persistence failed', error)});
      }
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

  private askFrozenStudyQuestion(
    question: string,
    scrollDiv: HTMLElement | undefined,
    source: 'suggested' | 'free_text'
  ): void {
    this.possibleNextQuestions = [];
    this.history.push({user: true, text: this.sanitizer.sanitize(SecurityContext.HTML, question)});
    this.loading = true;
    const requestId = this.newRequestId();
    this.studyConversation.sendFrozenMessage(
      this.studyConversationCaseId!, this.disease || '', question, source, requestId, this.newRequestId()
    ).subscribe({
      next: state => {
        this.hydrateConversation(state);
      },
      error: error => {
        console.error('Frozen Study conversation message failed', error);
        this.loading = false;
        this.history.push({
          user: false,
          error: true,
          text: this.sanitizer.sanitize(SecurityContext.HTML, 'The Study response could not be loaded safely. Please try again.')
        });
      },
      complete: () => {
        this.loading = false;
        if (scrollDiv) {
          setTimeout(() => scrollDiv.scrollTo({top: scrollDiv.scrollHeight, behavior: 'smooth'}), 100);
        }
      }
    });
  }

  private askDynamicStudyQuestion(
    question: string, scrollDiv: HTMLElement | undefined, source: 'suggested' | 'free_text'
  ): void {
    this.possibleNextQuestions = [];
    this.history.push({user: true, text: this.sanitizer.sanitize(SecurityContext.HTML, question)});
    this.loading = true;
    const requestId = this.newRequestId();
    this.studyConversation.sendDynamicMessage(
      this.studyConversationCaseId!, this.disease || '', question, source, requestId, this.newRequestId()
    ).subscribe({
      next: state => this.hydrateConversation(state),
      error: error => {
        console.error('Dynamic Study conversation message failed', error);
        this.loading = false;
        this.history.push({user: false, error: true, text: this.sanitizer.sanitize(
          SecurityContext.HTML, 'The Study response could not be loaded safely. Please try again.'
        )});
      },
      complete: () => {
        this.loading = false;
        if (scrollDiv) setTimeout(() => scrollDiv.scrollTo({top: scrollDiv.scrollHeight, behavior: 'smooth'}), 100);
      }
    });
  }

  private isFrozenStudyTarget(): boolean {
    return this.studyMode && !!this.studyConversationCaseId && this.disease === this.primaryStudyDisease;
  }

  private isDynamicStudyDisease(): boolean {
    return this.studyMode && !!this.studyConversationCaseId && this.disease !== this.primaryStudyDisease;
  }

  private getExplaination(chart: string | undefined) {
    switch (chart) {
      case 'waterfall':
        return `[Waterfall Chart, y-axis: SHAP feature names, x-axis: numeric SHAP values: negative values are shown as orange bars, positive values are shown as blue bars ]`
      default:
        return chart;
    }
  }

  formatDisplayText(value: string | null | undefined): string {
    if (!value || !this.studyMode) return value ?? '';

    return value.replace(
      /\bwaterfall((?:\s+(?:chart|graph|plot))*)\b/gi,
      (_match, chartTerms: string) => chartTerms
        ? 'Patient-Specific Feature Impact chart'
        : 'Patient-Specific Feature Impact'
    );
  }

  isMissingnessWarning(value: string | null | undefined): boolean {
    return this.studyMode && /^\s*Missingness warning:/i.test(value ?? '');
  }

  formatFactorWithProvenance(value: string): string {
    if (!this.studyMode || this.chart !== 'waterfall' || !value) {
      return value;
    }
  
    const waterfall = this.localPlotResponse?.results?.find(
      result => result.disease === this.disease
    )?.plots?.['waterfall']?.waterfall_data;
  
    const contributors = [
      ...(waterfall?.top_positive_contributors ?? []),
      ...(waterfall?.top_negative_contributors ?? [])
    ];
  
    const lowerValue = value.toLowerCase();
  
    // Match using either display names or canonical feature names.
    // Prefer longer matches to avoid matching a partial feature name.
    const contributor = contributors
      .flatMap(item =>
        [item.display_name, item.feature_name]
          .filter((name): name is string => !!name)
          .map(name => ({ item, name }))
      )
      .sort((a, b) => b.name.length - a.name.length)
      .find(entry => lowerValue.includes(entry.name.toLowerCase()))
      ?.item;
  
    if (!contributor || typeof contributor.is_imputed !== 'boolean') {
      return value;
    }
  
    const label = contributor.is_imputed ? 'Estimated' : 'Observed';
  
    // Remove provenance wording supplied by the LLM.
    let formatted = value
      .replace(
        /\s*:\s*estimated\s*\((?:value not directly available|not directly observed)\)/gi,
        ''
      )
      .replace(
        /\s*\(estimated\s*\((?:value not directly available|not directly observed)\)\)/gi,
        ''
      )
      .replace(/\s*\((?:Observed|Estimated)\)/gi, '')
      .replace(/\s*:\s*estimated\s*\([^)]*\)/gi, '')
      .trim();
  
    // Round numeric feature values in the displayed explanation.
    // Only match a numeric value immediately after ":",
    // avoiding numbers embedded in feature names.
    formatted = formatted.replace(
      /(:\s*)(-?\d+\.\d{3,})(?=\s|$)/,
      (_match, prefix, number) =>
        `${prefix}${Number(Number(number).toFixed(2))}`
    );
  
    return `${formatted} (${label})`;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private renderAssistantMessage(value: string): string | null {
    return this.sanitizer.sanitize(
      SecurityContext.HTML,
      md.render(this.formatDisplayText(value))
    );
  }

  private hydrateConversation(state: StudyConversationState): boolean {
    const explanation = state.initialExplanations?.[this.chart];
    this.sessionId = state.llmSessionId;
    this.possibleNextQuestions = state.suggestedQuestions ?? [];
    this.suggestedQuestionIds = {};
    this.persistedMessages = state.messages ?? [];
    this.history = this.persistedMessages.map(message => ({
      user: message.role === 'user',
      text: message.role === 'assistant'
        ? this.renderAssistantMessage(message.text)
        : this.sanitizer.sanitize(SecurityContext.HTML, message.text)
    }));
    // Non-primary explanations are intentionally not retained as study
    // records. Keep their follow-up history, then let init() fetch the initial
    // explanation again for display without changing interaction logging.
    if (!explanation) return false;
    this.plotOverview = explanation.plotOverview;
    this.plotSummary = explanation.plotSummary;
    this.increasingFactors = explanation.increasingFactors;
    this.decreasingFactors = explanation.decreasingFactors;
    this.confidenceAndCaveats = explanation.confidenceAndCaveats;
    this.loading = false;
    return true;
  }

  private persistConversation(): void {
    if (!this.studyConversationCaseId || !this.sessionId || !this.disease) return;
    const state: StudyConversationState = {
      caseId: this.studyConversationCaseId,
      disease: this.disease,
      block: 'B',
      chartType: this.chart,
      llmSessionId: this.sessionId,
      initialExplanations: {
        [this.chart]: {
          plotOverview: this.plotOverview,
          plotSummary: this.plotSummary,
          increasingFactors: this.increasingFactors,
          decreasingFactors: this.decreasingFactors,
          confidenceAndCaveats: this.confidenceAndCaveats
        }
      },
      messages: this.persistedMessages,
      suggestedQuestions: this.possibleNextQuestions,
      schemaVersion: 1
    };
    this.studyConversation.save(this.studyConversationCaseId, state).subscribe({
      error: error => console.error('Study conversation persistence failed', error)
    });
  }

  private newRequestId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
