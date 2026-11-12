import {CommonModule} from '@angular/common';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {Observable, of, Subject} from 'rxjs';
import {debounceTime, takeUntil} from 'rxjs/operators';
import {StudyDirectComparisonAnswers} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';
import {
  STUDY_COMPARISON_QUESTIONS
} from './study-comparison-questions';

function nonWhitespace(control: AbstractControl) {
  return typeof control.value === 'string' && control.value.trim().length > 0
    ? null
    : {whitespace: true};
}

@Component({
  selector: 'app-study-comparison',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './study-comparison.component.html',
  styleUrls: ['./study-comparison.component.scss']
})
export class StudyComparisonComponent implements OnInit, OnDestroy {
  readonly questions = STUDY_COMPARISON_QUESTIONS;
  readonly form = new FormGroup({
    understandingPreference: new FormControl<string | null>(null, Validators.required),
    clinicalPracticePreference: new FormControl<string | null>(null, Validators.required),
    llmAddedValue: new FormControl<string | null>(null, Validators.required),
    llmChartMatch: new FormControl<string | null>(null, Validators.required),
    llmChartMatchDescription: new FormControl('', nonWhitespace),
    patientExplanationHelp: new FormControl<string | null>(null, Validators.required),
    patientExplanationWhy: new FormControl('', [Validators.required, nonWhitespace])
  });

  draftError: string | null = null;
  submissionError: string | null = null;
  submitted = false;
  private completed = false;
  private formHydrated = false;
  private unregisterLogoutFlusher: (() => void) | null = null;
  private logoutFlushStarted = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private progressService: StudyProgressService
  ) {}

  ngOnInit(): void {
    this.form.get('llmChartMatch')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      this.updateConditionalValidators(value);
    });
    this.form.valueChanges.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (!this.progressService.isLogoutFlushInProgress()) {
        this.persistDraft();
      }
    });

    this.progressService.loadComparisonAnswers().subscribe({
      next: saved => {
        if (saved) {
          this.form.patchValue(saved, {emitEvent: false});
          this.updateConditionalValidators(saved.llmChartMatch);
        }
        this.formHydrated = true;
        this.unregisterLogoutFlusher = this.progressService.registerLogoutFlusher(
          () => {
            this.logoutFlushStarted = true;
            return this.persistDraft$();
          }
        );
      },
      error: error => {
        this.formHydrated = true;
        this.draftError = this.progressService.participantFacingError(
          error, 'Comparison questionnaire'
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.unregisterLogoutFlusher?.();
    this.unregisterLogoutFlusher = null;
    if (this.formHydrated && !this.completed && this.form.dirty
      && !this.logoutFlushStarted && !this.progressService.isLogoutFlushInProgress()) {
      this.persistDraft();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  submit(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.submissionError = 'Please answer every question before continuing.';
      return;
    }

    this.progressService.submitComparison(this.answersFromForm()).subscribe({
      next: destination => {
        this.completed = true;
        this.submissionError = null;
        this.router.navigate(destination, {replaceUrl: true});
      },
      error: error => this.submissionError = this.progressService.participantFacingError(
        error, 'Your comparison'
      )
    });
  }

  showValidation(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (this.submitted || control.touched);
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
    if (this.completed || !this.formHydrated) {
      return of(undefined);
    }
    return this.progressService.saveComparisonDraft(this.answersFromForm());
  }

  private answersFromForm(): StudyDirectComparisonAnswers {
    const raw = this.form.getRawValue();
    const answers: StudyDirectComparisonAnswers = {};
    if (raw.understandingPreference) answers.understandingPreference = raw.understandingPreference as StudyDirectComparisonAnswers['understandingPreference'];
    if (raw.clinicalPracticePreference) answers.clinicalPracticePreference = raw.clinicalPracticePreference as StudyDirectComparisonAnswers['clinicalPracticePreference'];
    if (raw.llmAddedValue) answers.llmAddedValue = raw.llmAddedValue as StudyDirectComparisonAnswers['llmAddedValue'];
    if (raw.llmChartMatch) answers.llmChartMatch = raw.llmChartMatch as StudyDirectComparisonAnswers['llmChartMatch'];
    const description = raw.llmChartMatchDescription?.trim();
    if (description) answers.llmChartMatchDescription = description;
    if (raw.patientExplanationHelp) answers.patientExplanationHelp = raw.patientExplanationHelp as StudyDirectComparisonAnswers['patientExplanationHelp'];
    const why = raw.patientExplanationWhy?.trim();
    if (why) answers.patientExplanationWhy = why;
    return answers;
  }

  private updateConditionalValidators(value: string | null | undefined): void {
    const description = this.form.get('llmChartMatchDescription');
    if (value === 'yes') {
      description?.setValidators([Validators.required, nonWhitespace]);
    } else {
      description?.clearValidators();
    }
    description?.updateValueAndValidity({emitEvent: false});
  }
}
