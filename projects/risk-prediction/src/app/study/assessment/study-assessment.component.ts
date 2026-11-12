import {Component, ElementRef, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {Observable, of, Subject} from 'rxjs';
import {debounceTime, takeUntil} from 'rxjs/operators';
import {StudyAssessmentAnswers} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';
import {StudyCaseStimulusService} from '../services/study-case-stimulus.service';
import {FrozenStudyCase} from '../models/frozen-study-case';
import {assignedCasePosition, studySection, StudySectionMetadata} from '../study-section.config';
import {
  STUDY_ASSESSMENT_CONFIDENCE_QUESTION,
  STUDY_ASSESSMENT_QUESTIONS,
  StudyAssessmentQuestionId
} from './study-assessment-questions';

type AssessmentFormValue = Record<StudyAssessmentQuestionId, string | number | null>;

@Component({
  selector: 'app-study-assessment',
  templateUrl: './study-assessment.component.html',
  styleUrls: ['./study-assessment.component.scss']
})
export class StudyAssessmentComponent implements OnInit, OnDestroy {
  questions = STUDY_ASSESSMENT_QUESTIONS;
  readonly confidenceQuestion = STUDY_ASSESSMENT_CONFIDENCE_QUESTION;

  caseId: string | null = null;
  error: string | null = null;
  draftError: string | null = null;
  submissionError: string | null = null;
  caseCompleted = false;
  completionDestination: string[] | null = null;
  completionSection: StudySectionMetadata | null = null;
  completionCaseNumber = 1;
  completionTotalCases = 1;
  submitted = false;
  touchedQuestions = new Set<StudyAssessmentQuestionId>();
  answers: AssessmentFormValue = this.emptyAnswers();

  private readonly draftChanges = new Subject<void>();
  private readonly destroy$ = new Subject<void>();
  private assessmentReady = false;
  private timingStarted = false;
  private logoutFlushStarted = false;
  private unregisterLogoutFlusher: (() => void) | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private progressService: StudyProgressService,
    private elementRef: ElementRef<HTMLElement>,
    private stimuli: StudyCaseStimulusService
  ) {
    this.draftChanges.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (!this.progressService.isLogoutFlushInProgress()) {
        this.persistDraft();
      }
    });
  }

  ngOnInit(): void {
    this.caseId = this.route.snapshot.paramMap.get('caseId')
      ?? this.route.snapshot.data['studyCaseId'];
    if (!this.caseId) {
      this.error = 'Invalid or unavailable study case.';
      return;
    }
    const cached = this.progressService.getCachedCase(this.caseId);
    if (cached?.status !== 'completed' && cached?.phase === 'assessment') {
      this.startAssessmentTiming();
    }
    this.progressService.loadCase(this.caseId).subscribe({
      next: progress => {
        if (progress.status === 'completed' || progress.phase !== 'assessment') {
          this.error = 'Invalid or unavailable study case.';
          return;
        }
        this.stimuli.getCase(this.caseId!).subscribe({
          next: stimulus => {
            const block = progress.block;
            this.completionSection = studySection(block);
            const position = assignedCasePosition(
              this.progressService.getParticipantProgress(), block, this.caseId!
            );
            this.completionCaseNumber = position.number;
            this.completionTotalCases = position.total;
            this.configureQuestions(stimulus.case, position.number === 1);
            this.answers = this.answersFromProgress(progress.assessmentAnswers);
            try {
              this.startAssessmentTiming();
              this.assessmentReady = true;
              this.unregisterLogoutFlusher = this.progressService.registerLogoutFlusher(
                () => {
                  this.logoutFlushStarted = true;
                  return this.persistDraft$();
                }
              );
            } catch (error) {
              this.error = this.progressService.participantFacingError(error, 'Case assessment');
            }
          },
          error: error => this.error = error instanceof Error ? error.message : 'Study case catalog could not be loaded.'
        });
      },
      error: error => this.error = this.progressService.participantFacingError(error, 'Case assessment')
    });
  }

  private startAssessmentTiming(): void {
    if (!this.timingStarted && this.caseId) {
      this.progressService.enterPhase(this.caseId, 'assessment');
      this.timingStarted = true;
    }
  }

  ngOnDestroy(): void {
    this.unregisterLogoutFlusher?.();
    this.unregisterLogoutFlusher = null;
    if (this.assessmentReady && !this.caseCompleted && !this.logoutFlushStarted
      && !this.progressService.isLogoutFlushInProgress()) {
      this.persistDraft();
    }
    this.destroy$.next();
    this.destroy$.complete();
    this.draftChanges.complete();
    this.progressService.leavePhase();
  }

  answerChanged(id: StudyAssessmentQuestionId, value: string | number): void {
    this.answers[id] = id === 's1' ? Number(value) : value;
    this.draftError = null;
    this.submissionError = null;
    this.draftChanges.next();
  }

  private configureQuestions(studyCase: FrozenStudyCase, includeP3: boolean): void {
    const config = studyCase.assessmentConfig;
    if (!config) {
      this.error = 'This study case is missing its assessment configuration.';
      return;
    }
    this.questions = STUDY_ASSESSMENT_QUESTIONS
      .filter(question => question.id !== 'p3' || includeP3)
      .map(question => {
      const configured = config[question.id as keyof typeof config];
      if (!configured) return question;
      let prompt = question.prompt;
      if (configured.prompt) {
        prompt = configured.prompt;
      } else if (question.id === 'p5') {
        prompt = `Based on this explanation alone, can we conclude that ${configured.displayLabel ?? configured.feature} causes an increase in this patient's risk?`;
      } else if (question.id === 'p6') {
        prompt = `Was the ${configured.displayLabel ?? configured.feature} value measured for this patient or estimated by the system?`;
      }
      return {
        ...question,
        prompt,
        ...(configured.options ? {
          options: configured.options.map(option => ({
            value: option,
            label: configured.optionLabels?.[option] ?? option
          }))
        } : {})
      };
      });
  }

  questionLabel(id: StudyAssessmentQuestionId): string {
    return id.toUpperCase();
  }

  markTouched(id: StudyAssessmentQuestionId): void {
    this.touchedQuestions.add(id);
  }

  showValidation(id: StudyAssessmentQuestionId): boolean {
    return (this.submitted || this.touchedQuestions.has(id)) && !this.isAnswerValid(id);
  }

  submit(): void {
    if (!this.caseId || this.error || this.caseCompleted) {
      return;
    }

    this.submitted = true;
    this.trimTextAnswers();
    const firstInvalid = this.allQuestionIds().find(id => !this.isAnswerValid(id));

    if (firstInvalid) {
      this.submissionError = 'Please answer all required questions before submitting.';
      setTimeout(() => this.focusQuestion(firstInvalid));
      return;
    }

    const finalAnswers = this.toStudyAssessmentAnswers();
    this.progressService.completeCase(this.caseId, finalAnswers).subscribe({
      next: destination => {
        this.caseCompleted = true;
        this.assessmentReady = false;
        this.submissionError = null;
        this.completionDestination = destination;
      },
      error: error => this.submissionError = this.progressService.participantFacingError(
        error, 'Your answers'
      )
    });
  }

  continueAfterCompletion(): void {
    if (this.completionDestination) {
      this.router.navigate(this.completionDestination, {replaceUrl: true});
    }
  }

  get isSectionComplete(): boolean {
    return this.completionCaseNumber >= this.completionTotalCases;
  }

  private persistDraft(): void {
    this.persistDraft$().subscribe({
      next: () => this.draftError = null,
      error: error => this.draftError = this.progressService.participantFacingError(
        error, 'Your draft'
      )
    });
  }

  private persistDraft$(): Observable<unknown> {
    if (!this.caseId || !this.assessmentReady || this.caseCompleted || this.error) {
      return of(undefined);
    }

    return this.progressService.saveAssessmentDraft(
      this.caseId,
      this.toDraftAssessmentAnswers()
    );
  }

  private toDraftAssessmentAnswers(): StudyAssessmentAnswers {
    const draft: StudyAssessmentAnswers = {};
    const choiceIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
    for (const id of choiceIds) {
      const value = this.answers[id];
      if (typeof value === 'string' && value.length > 0) {
        draft[id] = value;
      }
    }
    if (typeof this.answers.s1 === 'number' && Number.isInteger(this.answers.s1)) {
      draft.s1 = this.answers.s1;
    }
    return draft;
  }

  private isAnswerValid(id: StudyAssessmentQuestionId): boolean {
    const value = this.answers[id];
    if (id === 's1') {
      return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 7;
    }

    const question = this.questions.find(candidate => candidate.id === id);
    if (question?.type === 'single-choice') {
      return question.options?.some(option => option.value === value) === true;
    }

    return typeof value === 'string' && value.trim().length > 0;
  }

  private trimTextAnswers(): void {}

  private focusQuestion(id: StudyAssessmentQuestionId): void {
    const question = this.elementRef.nativeElement.querySelector<HTMLElement>(
      `[data-question-id="${id}"]`
    );
    question?.querySelector<HTMLElement>('input, textarea, button')?.focus();
  }

  private toStudyAssessmentAnswers(): StudyAssessmentAnswers {
    const answers: StudyAssessmentAnswers = {
      p1: this.answers.p1,
      p2: this.answers.p2,
      p4: this.answers.p4,
      p5: this.answers.p5,
      p6: this.answers.p6,
      s1: this.answers.s1
    };
    if (this.questions.some(question => question.id === 'p3')) {
      answers.p3 = this.answers.p3;
    }
    return answers;
  }

  private answersFromProgress(saved: StudyAssessmentAnswers): AssessmentFormValue {
    const answers = this.emptyAnswers();
    for (const id of this.allQuestionIds()) {
      const value = saved[id];
      if (id === 's1') {
        answers[id] = typeof value === 'number' && value >= 1 && value <= 7
          ? value
          : null;
      } else {
        const question = this.questions.find(candidate => candidate.id === id);
        const isConfiguredChoice = question?.type === 'single-choice';
        answers[id] = typeof value === 'string'
          && (
            !isConfiguredChoice
            || question.options?.some(option => option.value === value)
          )
          ? value
          : '';
      }
    }
    return answers;
  }

  private emptyAnswers(): AssessmentFormValue {
    return {
      p1: '',
      p2: '',
      p3: null,
      p4: null,
      p5: null,
      p6: '',
      s1: null
    };
  }

  private allQuestionIds(): StudyAssessmentQuestionId[] {
    return [...this.questions.map(question => question.id), this.confidenceQuestion.id];
  }
}
