import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {StudyAuthService} from '../auth/study-auth.service';
import {StudyProgressService} from '../services/study-progress.service';

@Component({
  selector: 'app-study-entry',
  template: '<div class="text-center p-5"><span class="spinner-border" aria-hidden="true"></span><p class="mt-3">Opening your study session…</p></div>'
})
export class StudyEntryComponent implements OnInit {
  constructor(
    private auth: StudyAuthService,
    private progress: StudyProgressService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.auth.isAuthenticated) {
      void this.router.navigate(['/study/login'], {replaceUrl: true});
      return;
    }
    this.progress.resolveAuthenticatedEntryDestination().subscribe({
      next: destination => void this.router.navigate(destination, {replaceUrl: true}),
      error: () => {
        this.auth.logout();
        void this.router.navigate(['/study/login'], {
          queryParams: {reason: 'resume-failed'},
          replaceUrl: true
        });
      }
    });
  }
}
