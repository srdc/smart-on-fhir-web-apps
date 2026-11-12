import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {environment} from '../../../environments/environment';
import {
  StudyAssessmentAnswers,
  StudyBackgroundAnswers,
  StudyCasePhase,
  StudyCaseProgress,
  StudyDirectComparisonAnswers,
  StudyInterviewAnswers,
  StudyParticipantProgress,
  StudyPostBlockAnswers
} from '../models/study-case-progress';
import {StudyAuthService} from '../auth/study-auth.service';

interface ParticipantStateDto {
  participant: {participant_id: string};
  progress: {
    participant_id: string;
    current_stage: StudyParticipantProgress['currentStage'];
    assigned_case_order: {A: string[]; B: string[]};
    assignment_group?: StudyParticipantProgress['assignmentGroup'];
    current_case_id: string | null;
    completed_case_ids: string[];
    post_a_completed: boolean;
    post_b_completed: boolean;
    comparison_completed: boolean;
    background_completed: boolean;
    started_at: string | null;
    completed_at: string | null;
  };
}

interface CaseDto {
  case_id: string;
  block: StudyCaseProgress['block'];
  matched_pair_id?: string;
  presentation_position: number;
  qr_id?: string | null;
  status: StudyCaseProgress['status'];
  phase: StudyCasePhase;
  started_at: string | null;
  inspection_duration_ms: number;
  evaluation_duration_ms: number;
  assessment_answers: StudyAssessmentAnswers;
  completed_at: string | null;
}

interface PostBlockDto {
  nasa_rtlx: StudyPostBlockAnswers['nasaRtlx'];
  sus: StudyPostBlockAnswers['sus'];
  perceived_explanation_quality: StudyPostBlockAnswers['perceivedExplanationQuality'];
}

interface ComparisonDto {
  answers: StudyDirectComparisonAnswers;
}

interface InterviewDto extends StudyInterviewAnswers {
  participant_id: string;
  is_final: boolean;
  submitted_at: string | null;
  schema_version: number;
  updated_at: string;
}

interface BackgroundDto {
  participant_id: string;
  answers: StudyBackgroundAnswers;
  completed_at: string | null;
  updated_at: string;
}

export interface CaseUpdate {
  qrId?: string;
  phase?: StudyCasePhase;
  inspectionDurationMs?: number;
  evaluationDurationMs?: number;
  assessmentAnswers?: StudyAssessmentAnswers;
}

@Injectable({providedIn: 'root'})
export class HttpStudyProgressPersistence {
  private readonly baseUrl = environment.studyApiBaseUrl.replace(/\/$/, '');

  constructor(private http: HttpClient, private auth: StudyAuthService) {}

  get participantId(): string {
    const participantId = this.auth.participantId;
    if (!participantId) {
      throw new Error('An authenticated Study participant is required.');
    }
    return participantId;
  }

  initializeParticipant(): Observable<StudyParticipantProgress> {
    return this.http.post<ParticipantStateDto>(this.participantUrl('initialize'), {})
      .pipe(map(response => this.mapParticipant(response)));
  }

  loadParticipant(): Observable<StudyParticipantProgress> {
    return this.http.get<ParticipantStateDto>(this.participantUrl())
      .pipe(map(response => this.mapParticipant(response)));
  }

  listCases(): Observable<StudyCaseProgress[]> {
    return this.http.get<CaseDto[]>(this.participantUrl('cases'))
      .pipe(map(cases => cases.map(item => this.mapCase(item))));
  }

  getCase(caseId: string): Observable<StudyCaseProgress> {
    return this.http.get<CaseDto>(this.caseUrl(caseId)).pipe(map(item => this.mapCase(item)));
  }

  startCase(caseId: string, qrId?: string): Observable<StudyCaseProgress> {
    return this.http.post<CaseDto>(`${this.caseUrl(caseId)}/start`, {
      ...(qrId ? {qr_id: qrId} : {})
    }).pipe(map(item => this.mapCase(item)));
  }

  updateCase(caseId: string, update: CaseUpdate): Observable<StudyCaseProgress> {
    return this.http.put<CaseDto>(this.caseUrl(caseId), this.casePayload(update))
      .pipe(map(item => this.mapCase(item)));
  }

  completeCase(
    caseId: string,
    answers: StudyAssessmentAnswers,
    inspectionDurationMs: number,
    evaluationDurationMs: number
  ): Observable<StudyCaseProgress> {
    return this.http.post<CaseDto>(`${this.caseUrl(caseId)}/complete`, {
      assessment_answers: answers,
      inspection_duration_ms: Math.round(inspectionDurationMs),
      evaluation_duration_ms: Math.round(evaluationDurationMs)
    }).pipe(map(item => this.mapCase(item)));
  }

  getPostBlock(block: 'A' | 'B'): Observable<StudyPostBlockAnswers> {
    return this.http.get<PostBlockDto>(this.participantUrl(`post-block/${block}`))
      .pipe(map(item => this.mapPostBlock(item)));
  }

  savePostBlock(block: 'A' | 'B', answers: StudyPostBlockAnswers): Observable<StudyPostBlockAnswers> {
    return this.http.put<PostBlockDto>(
      this.participantUrl(`post-block/${block}`), this.postBlockPayload(answers)
    ).pipe(map(item => this.mapPostBlock(item)));
  }

  submitPostBlock(block: 'A' | 'B', answers: StudyPostBlockAnswers): Observable<StudyPostBlockAnswers> {
    return this.http.post<PostBlockDto>(
      this.participantUrl(`post-block/${block}/submit`), this.postBlockPayload(answers)
    ).pipe(map(item => this.mapPostBlock(item)));
  }

  getComparison(): Observable<StudyDirectComparisonAnswers> {
    return this.http.get<ComparisonDto>(this.participantUrl('comparison'))
      .pipe(map(item => item.answers));
  }

  saveComparison(answers: StudyDirectComparisonAnswers): Observable<StudyDirectComparisonAnswers> {
    return this.http.put<ComparisonDto>(this.participantUrl('comparison'), answers)
      .pipe(map(item => item.answers));
  }

  submitComparison(answers: StudyDirectComparisonAnswers): Observable<StudyDirectComparisonAnswers> {
    return this.http.post<ComparisonDto>(this.participantUrl('comparison/submit'), answers)
      .pipe(map(item => item.answers));
  }

  beginComparison(): Observable<StudyParticipantProgress> {
    return this.http.post<ParticipantStateDto>(
      this.participantUrl('comparison/orientation'), {}
    ).pipe(map(response => this.mapParticipant(response)));
  }

  getInterview(): Observable<StudyInterviewAnswers> {
    return this.http.get<InterviewDto>(this.participantUrl('interview'));
  }

  saveInterview(answers: StudyInterviewAnswers): Observable<StudyInterviewAnswers> {
    return this.http.put<InterviewDto>(this.participantUrl('interview'), answers);
  }

  submitInterview(answers: StudyInterviewAnswers): Observable<StudyInterviewAnswers> {
    return this.http.post<InterviewDto>(this.participantUrl('interview/submit'), answers);
  }

  getBackground(): Observable<BackgroundDto> {
    return this.http.get<BackgroundDto>(this.participantUrl('background'));
  }

  saveBackground(answers: StudyBackgroundAnswers): Observable<BackgroundDto> {
    return this.http.put<BackgroundDto>(this.participantUrl('background'), answers);
  }

  submitBackground(answers: StudyBackgroundAnswers): Observable<BackgroundDto> {
    return this.http.post<BackgroundDto>(this.participantUrl('background/submit'), answers);
  }

  private participantUrl(suffix = ''): string {
    const root = `${this.baseUrl}/study/participants/${encodeURIComponent(this.participantId)}`;
    return suffix ? `${root}/${suffix}` : root;
  }

  private caseUrl(caseId: string): string {
    return this.participantUrl(`cases/${encodeURIComponent(caseId)}`);
  }

  private mapParticipant(response: ParticipantStateDto): StudyParticipantProgress {
    const value = response.progress;
    return {
      participantId: value.participant_id,
      assignmentGroup: value.assignment_group,
      currentStage: value.current_stage,
      assignedCaseOrder: value.assigned_case_order,
      currentCaseId: value.current_case_id,
      completedCaseIds: value.completed_case_ids,
      postACompleted: value.post_a_completed,
      postBCompleted: value.post_b_completed,
      comparisonCompleted: value.comparison_completed,
      backgroundCompleted: value.background_completed ?? false,
      postBlockAnswers: {},
      startedAt: value.started_at,
      completedAt: value.completed_at
    };
  }

  private mapCase(value: CaseDto): StudyCaseProgress {
    return {
      caseId: value.case_id,
      block: value.block,
      matchedPairId: value.matched_pair_id,
      presentationPosition: value.presentation_position,
      qrId: value.qr_id ?? undefined,
      status: value.status,
      phase: value.phase,
      startedAt: value.started_at,
      inspectionDurationMs: value.inspection_duration_ms,
      evaluationDurationMs: value.evaluation_duration_ms,
      assessmentAnswers: value.assessment_answers ?? {},
      completedAt: value.completed_at
    };
  }

  private casePayload(update: CaseUpdate): object {
    return {
      ...(update.qrId ? {qr_id: update.qrId} : {}),
      ...(update.phase ? {phase: update.phase} : {}),
      ...(update.inspectionDurationMs !== undefined
        ? {inspection_duration_ms: Math.round(update.inspectionDurationMs)} : {}),
      ...(update.evaluationDurationMs !== undefined
        ? {evaluation_duration_ms: Math.round(update.evaluationDurationMs)} : {}),
      ...(update.assessmentAnswers ? {assessment_answers: update.assessmentAnswers} : {})
    };
  }

  private postBlockPayload(answers: StudyPostBlockAnswers): object {
    return {
      nasa_rtlx: answers.nasaRtlx,
      sus: answers.sus,
      perceived_explanation_quality: answers.perceivedExplanationQuality
    };
  }

  private mapPostBlock(value: PostBlockDto): StudyPostBlockAnswers {
    return {
      nasaRtlx: value.nasa_rtlx ?? {},
      sus: value.sus ?? {},
      perceivedExplanationQuality: value.perceived_explanation_quality ?? {}
    };
  }
}
