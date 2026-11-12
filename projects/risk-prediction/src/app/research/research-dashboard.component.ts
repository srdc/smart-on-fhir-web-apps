import {CommonModule} from '@angular/common';
import {Component, OnInit} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import {Router, RouterLink} from '@angular/router';
import {ResearcherApiService, ResearchParticipantSummary} from './researcher-api.service';
import {ResearcherAuthService} from './researcher-auth.service';

@Component({
  selector: 'app-research-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './research-dashboard.component.html'
})
export class ResearchDashboardComponent implements OnInit {
  participants: ResearchParticipantSummary[] = [];
  loading = true;
  error: string | null = null;
  exportError: string | null = null;

  constructor(
    private api: ResearcherApiService,
    public auth: ResearcherAuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.api.listParticipants().subscribe({
      next: participants => { this.participants = participants; this.loading = false; },
      error: error => {
        this.loading = false;
        this.error = error instanceof HttpErrorResponse && error.status === 403
          ? 'Access denied.' : 'The researcher service is unavailable. Try again.';
      }
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/research/login'], {replaceUrl: true});
  }

  exportAll(): void {
    this.exportError = null;
    this.api.exportAllParticipants().subscribe({
      next: workbook => this.download(workbook, 'clinician-study-all-clinicians.xlsx'),
      error: () => this.exportError = 'The clinician export could not be downloaded. Try again.'
    });
  }

  private download(workbook: Blob, filename: string): void {
    const url = URL.createObjectURL(workbook);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  stageLabel(participant: ResearchParticipantSummary): string {
    if (!participant.backgroundCompleted) return 'Background / Introduction';
    return ({
      A: 'Charts only', POST_A: 'Post Charts only',
      B: 'Charts + LLM', POST_B: 'Post Charts + LLM',
      COMPARE_ORIENTATION: 'Direct comparison', COMPARE: 'Direct comparison',
      INTERVIEW: 'Semi-Structured Interview', COMPLETE: 'Complete'
    } as Record<string, string>)[participant.currentStage] ?? participant.currentStage;
  }
}
