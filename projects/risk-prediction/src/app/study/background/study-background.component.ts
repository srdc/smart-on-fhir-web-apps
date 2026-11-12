import {CommonModule} from '@angular/common';
import {Component, OnDestroy, OnInit} from '@angular/core';
import {AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {Observable, of, Subject} from 'rxjs';
import {debounceTime, takeUntil} from 'rxjs/operators';
import {StudyBackgroundAnswers} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';

function nonWhitespace(control: AbstractControl) {
  return typeof control.value === 'string' && control.value.trim().length > 0 ? null : {whitespace: true};
}

@Component({
  selector: 'app-study-background',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './study-background.component.html',
  styleUrls: ['./study-background.component.scss']
})
export class StudyBackgroundComponent implements OnInit, OnDestroy {
  readonly form = new FormGroup({
    ageRange: new FormControl<string | null>(null, Validators.required),
    gender: new FormControl<string | null>(null, Validators.required),
    primarySpecialty: new FormControl('', [Validators.required, nonWhitespace]),
    yearsSinceQualification: new FormControl<number | null>(null, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]),
    currentRole: new FormControl<string | null>(null, Validators.required),
    currentRoleOther: new FormControl(''),
    directPatientCareProportion: new FormControl<string | null>(null, Validators.required),
    mlRiskPredictionFamiliarity: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(5)]),
    llmFamiliarity: new FormControl<number | null>(null, [Validators.required, Validators.min(1), Validators.max(5)]),
    priorAiDecisionSupport: new FormControl<string | null>(null, Validators.required),
    priorShapExposure: new FormControl<string | null>(null, Validators.required),
    clinicalRiskCalculatorFrequency: new FormControl<string | null>(null, Validators.required)
  });
  loading = true;
  submitted = false;
  error: string | null = null;
  draftError: string | null = null;
  private completed = false;
  private hydrated = false;
  private readonly destroy$ = new Subject<void>();

  constructor(private progress: StudyProgressService, private router: Router) {}

  ngOnInit(): void {
    this.form.get('currentRole')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(value => {
      const control = this.form.get('currentRoleOther');
      control?.clearValidators();
      if (value !== 'other') control?.reset('', {emitEvent: false});
      control?.updateValueAndValidity({emitEvent: false});
    });
    this.form.valueChanges.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe(() => {
      if (this.hydrated && !this.completed) this.saveDraft();
    });
    this.progress.loadBackground().subscribe({
      next: answers => {
        if (answers) this.form.patchValue(answers, {emitEvent: false});
        this.loading = false;
        this.hydrated = true;
      },
      error: error => { this.loading = false; this.hydrated = true; this.error = this.progress.participantFacingError(error, 'Background questionnaire'); }
    });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  showValidation(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (this.submitted || control.touched);
  }

  submit(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.progress.submitBackground(this.answers()).subscribe({
      next: destination => { this.completed = true; void this.router.navigate(destination, {replaceUrl: true}); },
      error: error => this.error = this.progress.participantFacingError(error, 'Background questionnaire')
    });
  }

  private saveDraft(): void {
    this.progress.saveBackgroundDraft(this.answers()).subscribe({
      error: error => this.draftError = this.progress.participantFacingError(error, 'Background questionnaire draft')
    });
  }

  private answers(): StudyBackgroundAnswers {
    const raw = this.form.getRawValue();
    return {
      ...(raw.ageRange ? {ageRange: raw.ageRange as StudyBackgroundAnswers['ageRange']} : {}),
      ...(raw.gender ? {gender: raw.gender as StudyBackgroundAnswers['gender']} : {}),
      ...(raw.primarySpecialty?.trim() ? {primarySpecialty: raw.primarySpecialty.trim()} : {}),
      ...(raw.yearsSinceQualification !== null ? {yearsSinceQualification: raw.yearsSinceQualification} : {}),
      ...(raw.currentRole ? {currentRole: raw.currentRole as StudyBackgroundAnswers['currentRole']} : {}),
      ...(raw.currentRoleOther?.trim() ? {currentRoleOther: raw.currentRoleOther.trim()} : {}),
      ...(raw.directPatientCareProportion ? {directPatientCareProportion: raw.directPatientCareProportion as StudyBackgroundAnswers['directPatientCareProportion']} : {}),
      ...(raw.mlRiskPredictionFamiliarity !== null ? {mlRiskPredictionFamiliarity: raw.mlRiskPredictionFamiliarity} : {}),
      ...(raw.llmFamiliarity !== null ? {llmFamiliarity: raw.llmFamiliarity} : {}),
      ...(raw.priorAiDecisionSupport ? {priorAiDecisionSupport: raw.priorAiDecisionSupport as StudyBackgroundAnswers['priorAiDecisionSupport']} : {}),
      ...(raw.priorShapExposure ? {priorShapExposure: raw.priorShapExposure as StudyBackgroundAnswers['priorShapExposure']} : {}),
      ...(raw.clinicalRiskCalculatorFrequency ? {clinicalRiskCalculatorFrequency: raw.clinicalRiskCalculatorFrequency as StudyBackgroundAnswers['clinicalRiskCalculatorFrequency']} : {})
    };
  }
}
