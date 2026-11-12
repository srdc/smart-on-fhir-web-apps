import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {ResearcherAuthService} from './researcher-auth.service';

@Component({
  selector: 'app-research-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './research-login.component.html'
})
export class ResearchLoginComponent {
  username = '';
  password = '';
  error: string | null = null;
  submitting = false;

  constructor(
    private auth: ResearcherAuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  submit(): void {
    this.error = null;
    this.submitting = true;
    this.auth.login(this.username, this.password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl?.startsWith('/research') ? returnUrl : '/research/dashboard');
      },
      error: error => {
        this.submitting = false;
        this.error = error?.status === 403
          ? 'This researcher account is disabled.'
          : 'Invalid researcher username or password.';
      }
    });
  }
}
