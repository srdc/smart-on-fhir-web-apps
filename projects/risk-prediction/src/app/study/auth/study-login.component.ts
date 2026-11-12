import {CommonModule} from '@angular/common';
import {HttpErrorResponse} from '@angular/common/http';
import {Component, OnInit} from '@angular/core';
import {FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {switchMap} from 'rxjs/operators';
import {StudyProgressService} from '../services/study-progress.service';
import {StudyAuthService} from './study-auth.service';
import {FrozenStudyCaseIntegrityError} from '../services/study-case-stimulus.service';

@Component({
  selector: 'app-study-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './study-login.component.html'
})
export class StudyLoginComponent implements OnInit {
  readonly form = new FormGroup({
    participantId: new FormControl('', [Validators.required]),
    pin: new FormControl('', [Validators.required])
  });
  submitting = false;
  error: string | null = null;

  constructor(
    private auth: StudyAuthService,
    private progress: StudyProgressService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.auth.isAuthenticated) {
      this.progress.resolveAuthenticatedEntryDestination().subscribe({
        next: destination => void this.router.navigate(destination, {replaceUrl: true}),
        error: () => this.auth.logout()
      });
    }
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting) {
      return;
    }
    this.submitting = true;
    this.error = null;
    const {participantId, pin} = this.form.getRawValue();
    this.auth.login(participantId!, pin!).pipe(
      switchMap(() => this.progress.resolveAuthenticatedEntryDestination())
    ).subscribe({
      next: destination => {
        this.form.controls.pin.setValue('');
        this.submitting = false;
        // The backend destination always wins. A return URL may be stale, forged,
        // or point at a future stage and must never drive Study progression.
        void this.router.navigate(destination, {replaceUrl: true});
      },
      error: error => {
        this.auth.logout();
        this.form.controls.pin.setValue('');
        this.submitting = false;
        this.error = error instanceof FrozenStudyCaseIntegrityError
          ? error.message
          : error instanceof HttpErrorResponse && error.status === 0
          ? 'The study service is unavailable. Please try again.'
          : 'Invalid participant ID or PIN.';
      }
    });
  }
}
