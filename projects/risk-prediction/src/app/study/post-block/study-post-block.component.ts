import {CommonModule} from '@angular/common';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {Observable, of, Subject} from 'rxjs';
import {debounceTime, takeUntil} from 'rxjs/operators';
import {StudyPostBlockAnswers} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';
import {studySection} from '../study-section.config';
import {
  AGREEMENT_SCALE,
  NASA_RTLX_QUESTIONS,
  perceivedQualityQuestions,
  SUS_INSTRUCTION,
  SUS_QUESTIONS
} from './study-post-block-questions';

function multipleOfFive(control: AbstractControl): ValidationErrors | null {
  const value = Number(control.value);
  return control.value === null || value % 5 === 0 ? null : {step: true};
}

function integer(control: AbstractControl): ValidationErrors | null {
  return control.value === null || Number.isInteger(Number(control.value))
    ? null
    : {integer: true};
}

@Component({
  selector: 'app-study-post-block',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './study-post-block.component.html',
  styleUrls: ['./study-post-block.component.scss']
})
export class StudyPostBlockComponent implements OnInit, OnDestroy {
  readonly block = this.route.snapshot.data['studyBlock'] as 'A' | 'B';
  readonly sectionTitle = studySection(this.block).title;
  readonly nasaQuestions = NASA_RTLX_QUESTIONS;
  readonly susQuestions = SUS_QUESTIONS;
  readonly susInstruction = SUS_INSTRUCTION;
  readonly qualityQuestions = perceivedQualityQuestions(this.block);
  readonly agreementScale = AGREEMENT_SCALE;
  readonly form = new FormGroup({
    nasaRtlx: this.controlsFor(
      NASA_RTLX_QUESTIONS.map(question => question.id),
      [Validators.required, Validators.min(0), Validators.max(100), multipleOfFive]
    ),
    sus: this.controlsFor(
      SUS_QUESTIONS.map(question => question.id),
      [Validators.required, Validators.min(1), Validators.max(5), integer]
    ),
    perceivedExplanationQuality: this.controlsFor(
      this.qualityQuestions.map(question => question.id),
      [Validators.required, Validators.min(1), Validators.max(5), integer]
    )
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
    private route: ActivatedRoute,
    private router: Router,
    private progressService: StudyProgressService
  ) {}

  ngOnInit(): void {
    this.form.valueChanges.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (!this.progressService.isLogoutFlushInProgress()) {
        this.persistDraft();
      }
    });

    this.progressService.loadPostBlockAnswers(this.block).subscribe({
      next: saved => {
        if (saved) {
          const nasaRtlx = {...saved.nasaRtlx};
      
          if (nasaRtlx['performance'] !== null && nasaRtlx['performance'] !== undefined) {
            nasaRtlx['performance'] = 100 - Number(nasaRtlx['performance']);
          }
      
          this.form.patchValue(
            {...saved, nasaRtlx},
            {emitEvent: false}
          );
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
        error, `${this.sectionTitle} questionnaire`
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

    this.progressService.submitPostBlock(this.block, this.answersFromForm()).subscribe({
      next: destination => {
        this.completed = true;
        this.submissionError = null;
        this.router.navigate(destination, {replaceUrl: true});
      },
      error: error => this.submissionError = this.progressService.participantFacingError(
        error, `Your ${this.sectionTitle} answers`
      )
    });
  }

  showValidation(path: string): boolean {
    const control = this.form.get(path);
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
    return this.progressService.savePostBlockDraft(this.block, this.answersFromForm());
  }

  private answersFromForm(): StudyPostBlockAnswers {
    const raw = this.form.getRawValue();
    const nasaRtlx = this.numericAnswers(raw.nasaRtlx);
  
    if (nasaRtlx['performance'] !== undefined) {
      nasaRtlx['performance'] = 100 - nasaRtlx['performance'];
    }
  
    return {
      nasaRtlx,
      sus: this.numericAnswers(raw.sus),
      perceivedExplanationQuality: this.numericAnswers(raw.perceivedExplanationQuality)
    } as StudyPostBlockAnswers;
  }

  private numericAnswers(values: Record<string, number | string | null>): Record<string, number> {
    return Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value !== null && value !== '')
        .map(([key, value]) => [key, Number(value)])
    );
  }

  private controlsFor(
    ids: readonly string[],
    validators: Array<(control: AbstractControl) => ValidationErrors | null>
  ): FormGroup {
    return new FormGroup(Object.fromEntries(
      ids.map(id => [id, new FormControl<number | null>(null, validators)])
    ));
  }

}
