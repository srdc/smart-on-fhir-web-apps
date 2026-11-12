import {DOCUMENT} from '@angular/common';
import {Inject, Injectable} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {Observable, forkJoin, of, throwError} from 'rxjs';
import {catchError, map, shareReplay, switchMap, tap} from 'rxjs/operators';
import {
  StudyAssessmentAnswers,
  StudyBackgroundAnswers,
  StudyBlockId,
  StudyCasePhase,
  StudyCaseProgress,
  StudyDirectComparisonAnswers,
  StudyInterviewAnswers,
  StudyParticipantProgress,
  StudyParticipantStage,
  StudyPostBlockAnswers
} from '../models/study-case-progress';
import {assignedBlockForCase, getStudyCaseDefinition} from '../study-sequence.config';
import {HttpStudyProgressPersistence} from './http-study-progress.persistence';
import {StudyCaseStimulusService} from './study-case-stimulus.service';

export interface StudyCaseDestination {
  caseId: string | null;
  route: string[];
}

@Injectable({providedIn: 'root'})
export class StudyProgressService {
  private participant: StudyParticipantProgress | null = null;
  private readonly cases = new Map<string, StudyCaseProgress>();
  private initialization$: Observable<StudyParticipantProgress> | null = null;
  private activeCaseId: string | null = null;
  private activePhase: StudyCasePhase | null = null;
  private visibleStartedAt: number | null = null;
  private readonly logoutFlushers = new Set<() => Observable<unknown>>();
  private logoutFlushInProgress = false;

  constructor(
    private persistence: HttpStudyProgressPersistence,
    private stimuli: StudyCaseStimulusService,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.document.defaultView?.addEventListener('pagehide', this.onPageExit);
    this.document.defaultView?.addEventListener('beforeunload', this.onPageExit);
  }

  initializeParticipant(force = false): Observable<StudyParticipantProgress> {
    // A new authenticated Study session starts a fresh component lifecycle.
    this.logoutFlushInProgress = false;
    const authenticatedParticipantId = this.persistence.participantId;
    if (this.participant?.participantId !== authenticatedParticipantId) {
      this.participant = null;
      this.cases.clear();
      this.initialization$ = null;
    }
    if (this.participant && !force) {
      return of(this.participant);
    }
    if (this.initialization$ && !force) {
      return this.initialization$;
    }
    this.initialization$ = this.persistence.initializeParticipant().pipe(
      tap(progress => this.participant = progress),
      shareReplay(1)
    );
    return this.initialization$;
  }

  refreshParticipant(): Observable<StudyParticipantProgress> {
    return this.persistence.loadParticipant().pipe(tap(progress => this.participant = progress));
  }

  getParticipantProgress(): StudyParticipantProgress | null {
    return this.participant;
  }

  startOrResumeActiveCase(metadata?: {qrId?: string}): Observable<StudyCaseDestination> {
    return this.initializeParticipant().pipe(
      switchMap(participant => {
        if (!participant.backgroundCompleted) {
          return of({caseId: null, route: ['/study/background']});
        }
        if (!['A', 'B'].includes(participant.currentStage)) {
          return of({caseId: null, route: this.destinationFor(participant)});
        }
        const caseId = participant.currentCaseId;
        if (!caseId) {
          return throwError(() => new Error('The backend did not provide an active study case.'));
        }
        return this.persistence.getCase(caseId).pipe(
          switchMap(progress => metadata?.qrId && !progress.qrId
            ? this.persistence.startCase(caseId, metadata.qrId)
            : of(progress)),
          catchError(error => error instanceof HttpErrorResponse && error.status === 404
            ? this.persistence.startCase(caseId, metadata?.qrId)
            : throwError(() => error)),
          tap(progress => this.cases.set(caseId, progress)),
          map(progress => ({caseId, route: this.caseRoute(caseId, progress.phase)}))
        );
      })
    );
  }

  loadCase(caseId: string): Observable<StudyCaseProgress> {
    return this.persistence.getCase(caseId).pipe(tap(progress => this.cacheCase(progress)));
  }

  getCachedCase(caseId: string): StudyCaseProgress | null {
    return this.cases.get(caseId) ?? null;
  }

  authorizeCasePhase(caseId: string, requestedPhase: StudyCasePhase, expectedFrozen = false): Observable<true | string[]> {
    return this.initializeParticipant().pipe(
      switchMap(participant => {
        if (!participant.backgroundCompleted) {
          return of(['/study/background']);
        }
        const definition = getStudyCaseDefinition(caseId);
        const assignedBlock = assignedBlockForCase(participant, caseId);
        if (definition && assignedBlock && this.shouldShowSectionOrientation(participant)) {
          return of(['/study/section', assignedBlock]);
        }
        const accessible = !!definition
          && assignedBlock !== null
          && participant.currentStage === assignedBlock
          && participant.currentCaseId === caseId
          && (participant.assignedCaseOrder[assignedBlock] ?? []).includes(caseId)
          && !participant.completedCaseIds.includes(caseId);
        if (!accessible) {
          return of(this.destinationFor(participant));
        }
        return this.persistence.getCase(caseId).pipe(
          catchError(error => error instanceof HttpErrorResponse && error.status === 404
            ? this.persistence.startCase(caseId)
            : throwError(() => error)),
          tap(progress => this.cases.set(caseId, progress)),
          switchMap(progress => (expectedFrozen ? of(true) : this.stimuli.hasCatalogEntry(caseId)).pipe(
            map(isFrozen => !isFrozen
              ? ['/study']
              : progress.status !== 'completed' && progress.phase === requestedPhase
                ? true as const
                : ['/study/cases', caseId, progress.phase])
          )),
          catchError(() => of(this.destinationFor(participant)))
        );
      })
    );
  }

  authorizeStage(stage: Extract<StudyParticipantStage, 'POST_A' | 'POST_B' | 'COMPARE_ORIENTATION' | 'COMPARE' | 'INTERVIEW' | 'COMPLETE'>): Observable<true | string[]> {
    return this.initializeParticipant().pipe(
      map(progress => !progress.backgroundCompleted
        ? ['/study/background']
        : progress.currentStage === stage ? true as const : this.destinationFor(progress)),
      catchError(error => throwError(() => error))
    );
  }

  resolveCurrentDestination(force = true): Observable<string[]> {
    const participant$ = force ? this.refreshParticipant() : this.initializeParticipant();
    return participant$.pipe(
      switchMap(participant => {
        if (!participant.backgroundCompleted) {
          return of(['/study/background']);
        }
        if (!['A', 'B'].includes(participant.currentStage)) {
          return of(this.destinationFor(participant));
        }
        if (this.shouldShowSectionOrientation(participant)) {
          return of(['/study/section', participant.currentStage]);
        }
        const caseId = participant.currentCaseId;
        if (!caseId) {
          return throwError(() => new Error('The backend did not provide an active canonical Study case.'));
        }
        return this.resolveFrozenCaseDestination(caseId);
      })
    );
  }

  resolveAuthenticatedEntryDestination(): Observable<string[]> {
    return this.initializeParticipant(true).pipe(
      switchMap(participant => {
        if (!participant.backgroundCompleted) {
          return of(['/study/background']);
        }
        if (!['A', 'B'].includes(participant.currentStage)) {
          return of(this.destinationFor(participant));
        }
        if (this.shouldShowSectionOrientation(participant)) {
          return of(['/study/section', participant.currentStage]);
        }
        const caseId = participant.currentCaseId;
        if (!caseId) {
          return throwError(() => new Error('The backend did not provide an active canonical Study case.'));
        }
        return this.resolveFrozenCaseDestination(caseId);
      })
    );
  }

  markSectionOrientationSeen(block: StudyBlockId): void {
    const participantId = this.participant?.participantId ?? this.persistence.participantId ?? 'current';
    this.document.defaultView?.sessionStorage.setItem(`study-section-intro:${participantId}:${block}`, 'seen');
  }

  clearSectionOrientationSeen(block: StudyBlockId): void {
    const participantId = this.participant?.participantId ?? this.persistence.participantId ?? 'current';
    this.document.defaultView?.sessionStorage.removeItem(`study-section-intro:${participantId}:${block}`);
  }

  clearAllSectionOrientations(): void {
    (['A', 'B'] as StudyBlockId[]).forEach(block => this.clearSectionOrientationSeen(block));
  }

  clearLocalState(persistTiming = true): void {
    if (persistTiming) {
      this.leavePhase();
    } else {
      this.clearActiveTiming();
    }
    this.participant = null;
    this.cases.clear();
    this.initialization$ = null;
  }

  registerLogoutFlusher(flusher: () => Observable<unknown>): () => void {
    this.logoutFlushers.add(flusher);
    return () => this.logoutFlushers.delete(flusher);
  }

  flushPendingDrafts(): Observable<unknown[]> {
    this.logoutFlushInProgress = true;
    const flushes = [...this.logoutFlushers].map(flusher => flusher());
    // Include active case timing in the same barrier as editable-form drafts.
    // The caller must not clear auth until every request has completed.
    flushes.push(this.persistVisibleTime$());
    return forkJoin(flushes);
  }

  isLogoutFlushInProgress(): boolean {
    return this.logoutFlushInProgress;
  }

  beginAssessment(caseId: string): Observable<StudyCaseProgress> {
    const progress = this.requireCachedCase(caseId);
    this.accumulateVisibleTime();
    this.clearActiveTiming();
    return this.persistence.updateCase(caseId, {
      phase: 'assessment',
      inspectionDurationMs: progress.inspectionDurationMs,
      evaluationDurationMs: progress.evaluationDurationMs
    }).pipe(tap(saved => this.cases.set(caseId, saved)));
  }

  beginInspection(caseId: string): Observable<StudyCaseProgress> {
    const progress = this.requireCachedCase(caseId);
    if (progress.phase !== 'form') {
      return throwError(() => new Error(`Study case '${caseId}' cannot transition to inspection from ${progress.phase}.`));
    }
    return this.persistence.updateCase(caseId, {
      phase: 'inspection',
      inspectionDurationMs: progress.inspectionDurationMs,
      evaluationDurationMs: progress.evaluationDurationMs
    }).pipe(tap(saved => this.cases.set(caseId, saved)));
  }

  beginForm(caseId: string): Observable<StudyCaseProgress> {
    const progress = this.requireCachedCase(caseId);
    if (progress.phase !== 'summary') {
      return throwError(() => new Error(`Study case '${caseId}' cannot transition to form from ${progress.phase}.`));
    }
    return this.persistence.updateCase(caseId, {
      phase: 'form',
      inspectionDurationMs: progress.inspectionDurationMs,
      evaluationDurationMs: progress.evaluationDurationMs
    }).pipe(tap(saved => this.cases.set(caseId, saved)));
  }

  enterPhase(caseId: string, phase: StudyCasePhase): void {
    const progress = this.requireCachedCase(caseId);
    if (progress.status === 'completed' || progress.phase !== phase) {
      throw new Error(`Study case '${caseId}' cannot enter the ${phase} phase.`);
    }
    this.accumulateVisibleTime();
    this.clearActiveTiming();
    this.activeCaseId = caseId;
    this.activePhase = phase;
    if (this.document.visibilityState === 'visible') {
      this.visibleStartedAt = performance.now();
    }
  }

  leavePhase(): void {
    this.persistVisibleTime();
    this.clearActiveTiming();
  }

  saveAssessmentDraft(caseId: string, answers: StudyAssessmentAnswers): Observable<StudyCaseProgress> {
    this.accumulateVisibleTime();
    const progress = this.requireCachedCase(caseId);
    this.resumeVisibleTiming();
    return this.persistence.updateCase(caseId, {
      assessmentAnswers: answers,
      inspectionDurationMs: progress.inspectionDurationMs,
      evaluationDurationMs: progress.evaluationDurationMs
    }).pipe(tap(saved => this.cacheCase(saved)));
  }

  completeCase(caseId: string, answers: StudyAssessmentAnswers): Observable<string[]> {
    this.accumulateVisibleTime();
    this.clearActiveTiming();
    const progress = this.requireCachedCase(caseId);
    return this.persistence.completeCase(
      caseId,
      answers,
      progress.inspectionDurationMs,
      progress.evaluationDurationMs
    ).pipe(
      tap(saved => this.cases.set(caseId, saved)),
      switchMap(() => this.resolveCurrentDestination(true))
    );
  }

  loadPostBlockAnswers(block: 'A' | 'B'): Observable<StudyPostBlockAnswers | null> {
    return this.persistence.getPostBlock(block).pipe(
      tap(answers => this.cachePostBlock(block, answers)),
      map(answers => answers as StudyPostBlockAnswers | null),
      catchError(error => error instanceof HttpErrorResponse && error.status === 404
        ? of(null)
        : throwError(() => error))
    );
  }

  savePostBlockDraft(block: 'A' | 'B', answers: StudyPostBlockAnswers): Observable<StudyPostBlockAnswers> {
    return this.persistence.savePostBlock(block, answers)
      .pipe(tap(saved => this.cachePostBlock(block, saved)));
  }

  submitPostBlock(block: 'A' | 'B', answers: StudyPostBlockAnswers): Observable<string[]> {
    return this.persistence.submitPostBlock(block, answers).pipe(
      tap(saved => this.cachePostBlock(block, saved)),
      switchMap(() => this.resolveCurrentDestination(true))
    );
  }

  loadComparisonAnswers(): Observable<StudyDirectComparisonAnswers | null> {
    return this.persistence.getComparison().pipe(
      tap(answers => this.cacheComparison(answers)),
      map(answers => answers as StudyDirectComparisonAnswers | null),
      catchError(error => error instanceof HttpErrorResponse && error.status === 404
        ? of(null)
        : throwError(() => error))
    );
  }

  saveComparisonDraft(answers: StudyDirectComparisonAnswers): Observable<StudyDirectComparisonAnswers> {
    return this.persistence.saveComparison(answers)
      .pipe(tap(saved => this.cacheComparison(saved)));
  }

  submitComparison(answers: StudyDirectComparisonAnswers): Observable<string[]> {
    return this.persistence.submitComparison(answers).pipe(
      tap(saved => this.cacheComparison(saved)),
      switchMap(() => this.resolveCurrentDestination(true))
    );
  }

  loadInterviewAnswers(): Observable<StudyInterviewAnswers | null> {
    return this.persistence.getInterview().pipe(
      map(answers => answers as StudyInterviewAnswers),
      catchError(error => error instanceof HttpErrorResponse && error.status === 404
        ? of(null) : throwError(() => error))
    );
  }

  saveInterviewDraft(answers: StudyInterviewAnswers): Observable<StudyInterviewAnswers> {
    return this.persistence.saveInterview(answers);
  }

  submitInterview(answers: StudyInterviewAnswers): Observable<string[]> {
    return this.persistence.submitInterview(answers).pipe(
      switchMap(() => this.resolveCurrentDestination(true))
    );
  }

  beginComparison(): Observable<string[]> {
    return this.persistence.beginComparison().pipe(
      tap(participant => this.participant = participant),
      map(() => ['/study/compare'])
    );
  }

  loadBackground(): Observable<StudyBackgroundAnswers | null> {
    return this.persistence.getBackground().pipe(
      map(response => response.answers),
      catchError(error => error instanceof HttpErrorResponse && error.status === 404
        ? of(null) : throwError(() => error))
    );
  }

  saveBackgroundDraft(answers: StudyBackgroundAnswers): Observable<unknown> {
    return this.persistence.saveBackground(answers);
  }

  submitBackground(answers: StudyBackgroundAnswers): Observable<string[]> {
    return this.persistence.submitBackground(answers).pipe(
      tap(() => this.clearAllSectionOrientations()),
      switchMap(() => this.resolveAuthenticatedEntryDestination())
    );
  }

  participantFacingError(error: unknown, action: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'The study service is unavailable. Please keep this page open and try again.';
      }
      if (error.status === 404) {
        return 'The requested Study record could not be found. Please reload; if the problem continues, contact the Study administrator.';
      }
      if (error.status === 409) {
        return 'The study has advanced or this action is no longer available. Please reload the page.';
      }
      if (error.status === 422) {
        return 'Some answers were not accepted. Please review the form and try again.';
      }
    }
    return `${action} could not be completed. Please try again.`;
  }

  private destinationFor(progress: StudyParticipantProgress): string[] {
    switch (progress.currentStage) {
      case 'POST_A': return ['/study/post-a'];
      case 'POST_B': return ['/study/post-b'];
      case 'COMPARE_ORIENTATION': return ['/study/compare/orientation'];
      case 'COMPARE': return ['/study/compare'];
      case 'COMPLETE': return ['/study/complete'];
      case 'INTERVIEW': return ['/study/interview'];
      default:
        if (['A', 'B'].includes(progress.currentStage)
          && this.shouldShowSectionOrientation(progress)) {
          return ['/study/section', progress.currentStage];
        }
        return progress.currentCaseId
          ? this.caseRoute(progress.currentCaseId, this.cases.get(progress.currentCaseId)?.phase ?? 'inspection')
          : ['/study'];
    }
  }

  private shouldShowSectionOrientation(progress: StudyParticipantProgress): boolean {
    if (!['A', 'B'].includes(progress.currentStage)) return false;
    const block = progress.currentStage as StudyBlockId;
    const assigned = progress.assignedCaseOrder[block] ?? [];
    const hasCompletedCase = assigned.some(caseId => progress.completedCaseIds.includes(caseId));
    if (hasCompletedCase) return false;
    const participantId = progress.participantId ?? this.persistence.participantId ?? 'current';
    return this.document.defaultView?.sessionStorage.getItem(`study-section-intro:${participantId}:${block}`) !== 'seen';
  }

  private resolveFrozenCaseDestination(caseId: string): Observable<string[]> {
    return this.stimuli.hasCatalogEntry(caseId).pipe(
      switchMap(isFrozen => isFrozen
        ? this.persistence.getCase(caseId).pipe(
            catchError(error => error instanceof HttpErrorResponse && error.status === 404
              ? this.persistence.startCase(caseId)
              : throwError(() => error))
          )
        : throwError(() => new Error(`Canonical Study case '${caseId}' is missing from the frozen catalog.`))),
      tap(progress => this.cases.set(caseId, progress)),
      map(progress => this.caseRoute(caseId, progress.phase))
    );
  }

  private caseRoute(caseId: string, phase: StudyCasePhase): string[] {
    return ['/study/cases', caseId, phase];
  }

  private cachePostBlock(block: 'A' | 'B', answers: StudyPostBlockAnswers): void {
    if (this.participant) {
      this.participant.postBlockAnswers = {...this.participant.postBlockAnswers, [block]: answers};
    }
  }

  private cacheComparison(answers: StudyDirectComparisonAnswers): void {
    if (this.participant) {
      this.participant.comparisonAnswers = answers;
    }
  }

  private requireCachedCase(caseId: string): StudyCaseProgress {
    const progress = this.cases.get(caseId);
    if (!progress) {
      throw new Error(`Study case '${caseId}' has not been loaded.`);
    }
    return progress;
  }

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'hidden') {
      this.persistVisibleTime();
    } else if (this.activeCaseId && this.activePhase && this.visibleStartedAt === null) {
      this.visibleStartedAt = performance.now();
    }
  };

  private readonly onPageExit = (): void => this.persistVisibleTime();

  private accumulateVisibleTime(): void {
    if (!this.activeCaseId || !this.activePhase || this.visibleStartedAt === null) {
      return;
    }
    const progress = this.cases.get(this.activeCaseId);
    if (progress && progress.status !== 'completed') {
      const elapsedMs = Math.max(0, performance.now() - this.visibleStartedAt);
      if (this.activePhase === 'inspection') {
        progress.inspectionDurationMs += elapsedMs;
      } else {
        progress.evaluationDurationMs += elapsedMs;
      }
    }
    this.visibleStartedAt = null;
  }

  private resumeVisibleTiming(): void {
    if (this.activeCaseId && this.activePhase && this.visibleStartedAt === null
      && this.document.visibilityState === 'visible') {
      this.visibleStartedAt = performance.now();
    }
  }

  private cacheCase(saved: StudyCaseProgress): void {
    const current = this.cases.get(saved.caseId);
    if (current && this.activeCaseId === saved.caseId && current.status !== 'completed') {
      saved.inspectionDurationMs = Math.max(saved.inspectionDurationMs, current.inspectionDurationMs);
      saved.evaluationDurationMs = Math.max(saved.evaluationDurationMs, current.evaluationDurationMs);
    }
    this.cases.set(saved.caseId, saved);
  }

  private persistVisibleTime(): void {
    this.persistVisibleTime$().subscribe({
      next: saved => {
        if (saved) this.cases.set(saved.caseId, saved);
      },
      error: () => undefined
    });
  }

  private persistVisibleTime$(): Observable<StudyCaseProgress | undefined> {
    this.accumulateVisibleTime();
    if (!this.activeCaseId) {
      return of(undefined);
    }
    const progress = this.cases.get(this.activeCaseId);
    if (!progress || progress.status === 'completed') {
      return of(undefined);
    }
    return this.persistence.updateCase(this.activeCaseId, {
      inspectionDurationMs: progress.inspectionDurationMs,
      evaluationDurationMs: progress.evaluationDurationMs
    }).pipe(tap(saved => this.cases.set(saved.caseId, saved)));
  }

  private clearActiveTiming(): void {
    this.activeCaseId = null;
    this.activePhase = null;
    this.visibleStartedAt = null;
  }
}
