import {Component} from '@angular/core';
import {Router} from '@angular/router';
import {StudyProgressService} from '../services/study-progress.service';

@Component({
  selector: 'app-study-comparison-orientation',
  template: `<section class="study-comparison-orientation">
    <h1>Compare the two explanation approaches</h1>
    <p class="lead">You have completed the two main study sections. Next, you will answer a few questions comparing the charts-only and Charts + LLM approaches.</p>
    <button type="button" class="btn btn-primary" (click)="continueToComparison()">Continue to comparison</button>
    <div *ngIf="error" class="alert alert-danger mt-3">{{ error }}</div>
  </section>`,
  styles: ['.study-comparison-orientation { max-width: 48rem; margin: 3rem auto; text-align: center; }']
})
export class StudyComparisonOrientationComponent {
  error: string | null = null;
  constructor(private progress: StudyProgressService, private router: Router) {}
  continueToComparison(): void {
    this.progress.beginComparison().subscribe({
      next: destination => this.router.navigate(destination, {replaceUrl: true}),
      error: error => this.error = this.progress.participantFacingError(error, 'Comparison orientation')
    });
  }
}
