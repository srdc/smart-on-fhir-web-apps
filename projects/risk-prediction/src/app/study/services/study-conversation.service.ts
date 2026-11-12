import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {tap} from 'rxjs/operators';
import {environment} from '../../../environments/environment';
import {StudyAuthService} from '../auth/study-auth.service';

export interface StudyConversationMessage {
  role: 'user' | 'assistant';
  kind: 'user_suggested' | 'user_free_text' | 'assistant_answer';
  text: string;
  timestamp?: string;
  requestId?: string;
  suggestedQuestionId?: string;
}

export interface StudyInitialExplanation {
  plotOverview?: string;
  plotSummary?: string;
  increasingFactors?: string[];
  decreasingFactors?: string[];
  confidenceAndCaveats?: string[];
}

export interface StudyConversationState {
  participantId?: string;
  caseId?: string;
  disease: string;
  block: 'B';
  chartType: 'waterfall' | 'beeswarm';
  llmSessionId: string;
  initialExplanations: Record<string, StudyInitialExplanation>;
  messages: StudyConversationMessage[];
  suggestedQuestions: string[];
  schemaVersion: number;
  updatedAt?: string;
}

export interface StudyInteractionPayload {
  primaryStudyDisease: string;
  disease: string;
  chartType?: 'waterfall' | 'beeswarm';
  questionSource: 'suggested' | 'free_text';
  questionText: string;
  answerText: string;
  suggestedQuestionId?: string;
  llmSessionId?: string;
  requestId?: string;
  clientTimestamp?: string;
  eventId?: string;
}

@Injectable({providedIn: 'root'})
export class StudyConversationService {
  private readonly root = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study`;
  private readonly cache = new Map<string, StudyConversationState>();

  constructor(private http: HttpClient, private auth: StudyAuthService) {}

  get(caseId: string, disease: string, chartType: 'waterfall' | 'beeswarm'): Observable<StudyConversationState | null> {
    const cached = this.cache.get(this.key(caseId, disease, chartType));
    if (cached) return of(cached);
    const participantId = this.auth.participantId;
    if (!participantId) return of(null);
    return this.http.get<StudyConversationState | null>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/conversation/${chartType}?disease=${encodeURIComponent(disease)}`
    ).pipe(tap(state => {
      if (state) this.cache.set(this.key(caseId, disease, chartType), {...state, participantId, caseId, disease, chartType});
    }));
  }

  initializeFrozen(
    caseId: string, disease: string, caseContentHash: string, waterfallPayload: object
  ): Observable<StudyConversationState> {
    const participantId = this.auth.participantId;
    if (!participantId) throw new Error('Study participant authentication is required.');
    return this.http.post<StudyConversationState>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/frozen-conversation/waterfall/initialize`,
      {disease, caseContentHash, waterfallPayload}
    ).pipe(tap(state => this.cache.set(this.key(caseId, disease, 'waterfall'), {...state, participantId, caseId, disease, chartType: 'waterfall'})));
  }

  sendFrozenMessage(
    caseId: string,
    disease: string,
    questionText: string,
    questionSource: 'suggested' | 'free_text',
    requestId: string,
    eventId: string,
  ): Observable<StudyConversationState> {
    const participantId = this.auth.participantId;
    if (!participantId) throw new Error('Study participant authentication is required.');
    return this.http.post<StudyConversationState>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/frozen-conversation/waterfall/messages`,
      {disease, questionText, questionSource, requestId, eventId}
    ).pipe(tap(state => this.cache.set(this.key(caseId, disease, 'waterfall'), {...state, participantId, caseId, disease, chartType: 'waterfall'})));
  }

  initializeDynamic(
    caseId: string, disease: string, caseContentHash: string, waterfallPayload: object
  ): Observable<StudyConversationState> {
    const participantId = this.auth.participantId;
    if (!participantId) throw new Error('Study participant authentication is required.');
    return this.http.post<StudyConversationState>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/dynamic-conversation/waterfall/initialize`,
      {disease, caseContentHash, waterfallPayload}
    ).pipe(tap(state => this.cache.set(this.key(caseId, disease, 'waterfall'), {...state, participantId, caseId, disease, chartType: 'waterfall'})));
  }

  sendDynamicMessage(
    caseId: string, disease: string, questionText: string, questionSource: 'suggested' | 'free_text', requestId: string, eventId: string,
  ): Observable<StudyConversationState> {
    const participantId = this.auth.participantId;
    if (!participantId) throw new Error('Study participant authentication is required.');
    return this.http.post<StudyConversationState>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/dynamic-conversation/waterfall/messages`,
      {disease, questionText, questionSource, requestId, eventId}
    ).pipe(tap(state => this.cache.set(this.key(caseId, disease, 'waterfall'), {...state, participantId, caseId, disease, chartType: 'waterfall'})));
  }

  save(caseId: string, state: StudyConversationState): Observable<StudyConversationState> {
    const participantId = this.auth.participantId;
    if (!participantId) return of(state);
    // Keep response/cache metadata out of the strict write contract.
    const payload = {
      disease: state.disease,
      block: state.block,
      chartType: state.chartType,
      llmSessionId: state.llmSessionId,
      initialExplanations: state.initialExplanations,
      messages: state.messages,
      suggestedQuestions: state.suggestedQuestions,
      schemaVersion: state.schemaVersion
    };
    return this.http.put<StudyConversationState>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/conversation/${state.chartType}`,
      payload
    ).pipe(tap(saved => this.cache.set(this.key(caseId, state.disease, state.chartType), {...saved, participantId, caseId, disease: state.disease, chartType: state.chartType})));
  }

  logInteraction(caseId: string, payload: StudyInteractionPayload): Observable<unknown> {
    const participantId = this.auth.participantId;
    if (!participantId) return of(undefined);
    return this.http.post(
      `${this.root}/participants/${encodeURIComponent(participantId)}/cases/${encodeURIComponent(caseId)}/interactions`,
      payload
    );
  }

  clear(caseId?: string): void {
    if (caseId) {
      const prefix = `${this.auth.participantId ?? 'anonymous'}:${caseId}:`;
      [...this.cache.keys()].filter(key => key.startsWith(prefix)).forEach(key => this.cache.delete(key));
    }
    else this.cache.clear();
  }

  private key(caseId: string, disease: string, chartType: 'waterfall' | 'beeswarm'): string {
    return `${this.auth.participantId ?? 'anonymous'}:${caseId}:${disease}:${chartType}`;
  }
}
