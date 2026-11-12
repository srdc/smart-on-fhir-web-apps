import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {environment} from '../../environments/environment';

export interface ResearchParticipantSummary {
  participantId: string;
  assignmentGroup: 'XY' | 'YX' | 'legacy';
  assignedCaseOrder: {A: string[]; B: string[]};
  currentStage: string;
  currentCaseId: string | null;
  completedCaseIds: string[];
  postACompleted: boolean;
  postBCompleted: boolean;
  comparisonCompleted: boolean;
  interviewCompleted: boolean;
  backgroundCompleted: boolean;
  startedAt: string | null;
  completedAt: string | null;
  totalCompletedCases: number;
}

export interface ResearchCase {
  caseId: string;
  block: string;
  matchedPairId: string;
  presentationPosition: number;
  status: string;
  phase: string;
  inspectionDurationMs: number;
  evaluationDurationMs: number;
  startedAt: string | null;
  completedAt: string | null;
  assessmentAnswers: Record<string, unknown>;
  p3Applicable: boolean;
  assessmentScoring: ResearchAssessmentScore[];
  primaryStudyDisease: string;
}

export interface ResearchAssessmentScore {
  questionId: string;
  participantAnswer: unknown;
  expectedAnswer: unknown;
  acceptedAnswers: unknown[];
  status: 'correct' | 'incorrect' | 'unanswered' | 'not_scored';
  reason?: string;
  canonicalParticipantAnswer?: unknown;
}

export interface ResearchParticipantDetail extends ResearchParticipantSummary {
  cases: ResearchCase[];
  postA: ResearchPostBlock | null;
  postB: ResearchPostBlock | null;
  comparison: ResearchComparison | null;
  interview: ResearchInterview | null;
  background: ResearchBackground | null;
  interactions: ResearchInteraction[];
  initialExplanations: ResearchInitialExplanation[];
}

export interface ResearchInitialExplanation {
  caseId: string;
  block: string;
  primaryStudyDisease: string;
  interactionDisease: string;
  disease: string;
  chartType: 'waterfall' | 'beeswarm';
  llmSessionId: string;
  explanation: {
    plotOverview?: string;
    plotSummary?: string;
    increasingFactors?: string[];
    decreasingFactors?: string[];
    confidenceAndCaveats?: string[];
  };
  createdAt: string | null;
  schemaVersion: number;
}

export interface ResearchPostBlock {
  block: string;
  nasaRtlx: Record<string, number>;
  sus: Record<string, number>;
  perceivedExplanationQuality: Record<string, number>;
  isFinal: boolean;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface ResearchComparison {
  answers: Record<string, unknown>;
  isFinal: boolean;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface ResearchInterview {
  answers: Record<string, string>;
  isFinal: boolean;
  submittedAt: string | null;
  schemaVersion: number;
  updatedAt: string | null;
}

export interface ResearchBackground {
  answers: Record<string, unknown>;
  completedAt: string | null;
  updatedAt: string;
}

export interface ResearchInteraction {
  interactionId: number;
  sequenceNumber: number;
  caseId: string;
  block: string;
  chartType: 'waterfall' | 'beeswarm' | null;
  disease: string;
  primaryStudyDisease: string;
  interactionDisease: string;
  questionSource: string;
  questionText: string;
  answerText: string;
  suggestedQuestionId: string | null;
  llmSessionId: string | null;
  requestId: string | null;
  clientTimestamp: string | null;
  createdAt: string;
  review: ResearchInteractionReview | null;
}

export type ResearchIntentCategory = 'comprehension' | 'causal' | 'diagnostic'
  | 'treatment-seeking' | 'counterfactual' | 'prognostic' | 'data-provenance' | 'out-of-scope';

export interface ResearchInteractionReview {
  intentCategory: ResearchIntentCategory | null;
  diagnosisAdviceAbsent: boolean | null;
  treatmentAdviceAbsent: boolean | null;
  unsupportedCausalClaimAbsent: boolean | null;
  estimatedImputedValuesCommunicatedCorrectly: boolean | null;
  schemaVersion?: number;
  updatedAt?: string;
}

@Injectable({providedIn: 'root'})
export class ResearcherApiService {
  private readonly root = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study/research`;

  constructor(private http: HttpClient) {}

  listParticipants(): Observable<ResearchParticipantSummary[]> {
    return this.http.get<ResearchParticipantSummary[]>(`${this.root}/participants`);
  }

  getParticipant(participantId: string): Observable<ResearchParticipantDetail> {
    return this.http.get<ResearchParticipantDetail>(
      `${this.root}/participants/${encodeURIComponent(participantId)}`
    );
  }

  exportParticipant(participantId: string): Observable<Blob> {
    return this.http.get(`${this.root}/exports/participants/${encodeURIComponent(participantId)}.xlsx`, {
      responseType: 'blob'
    });
  }

  exportAllParticipants(): Observable<Blob> {
    return this.http.get(`${this.root}/exports/participants.xlsx`, {responseType: 'blob'});
  }

  saveInteractionReview(
    participantId: string,
    interactionId: number,
    review: ResearchInteractionReview
  ): Observable<ResearchInteractionReview> {
    return this.http.put<ResearchInteractionReview>(
      `${this.root}/participants/${encodeURIComponent(participantId)}/interactions/${interactionId}/review`,
      {
        intent_category: review.intentCategory,
        diagnosis_advice_absent: review.diagnosisAdviceAbsent,
        treatment_advice_absent: review.treatmentAdviceAbsent,
        unsupported_causal_claim_absent: review.unsupportedCausalClaimAbsent,
        estimated_imputed_values_communicated_correctly: review.estimatedImputedValuesCommunicatedCorrectly
      }
    );
  }
}
