import {Component, OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {ActivatedRoute, Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {SmartAuthService} from 'ng-smart-on-fhir';
import {environment} from '../../environments/environment';
import {DemoPatientService} from '../demo-patient.service';
import {StoryboardService, StoryPatient} from '../storyboard.service';
import {ResumeComponent} from './resume.component';

/** The test practitioner account shown to visitors: assets/config/demo-account.json of the deployment (not in git) */
export interface DemoAccount {
  username: string;
  password?: string;
  /** e.g. the role or name of the practitioner */
  note?: string;
}

/**
 * Before the login (the guards of /start and /story send here without a saved session): the visitor takes the role of
 * the clinician and logs in with the test practitioner account on the onAuth page, then continues with the page asked
 * for (ResumeComponent), e.g. making the copy of the chosen patient
 */
@Component({
  selector: 'demo-sign-in',
  templateUrl: './sign-in.component.html'
})
export class SignInComponent implements OnInit {
  story?: StoryPatient;
  /** the name of a new patient made from the story's record ("Make your own patient") */
  customName?: string;
  account?: DemoAccount;
  loginHint = environment.demonstrator.loginHint;
  copied?: 'username' | 'password';
  starting = false;

  constructor(private route: ActivatedRoute, private router: Router, private http: HttpClient,
              private storyboards: StoryboardService, private demo: DemoPatientService, private auth: SmartAuthService) {}

  async ngOnInit() {
    const next = ResumeComponent.peek();
    const url = next ? this.router.parseUrl(next) : undefined;
    const segments = url?.root.children['primary']?.segments.map(s => s.path) || [];
    try {
      const storyboard = await this.storyboards.load();
      let storyId = segments[0] === 'start' ? segments[1] : undefined;
      if (segments[0] === 'story') {
        storyId = this.demo.copy(segments[1])?.storyId;
      }
      this.story = storyboard.patients.find(p => p.id === storyId);
      const {given, family} = url?.queryParams || {};
      const name = [given, family].filter(Boolean).join(' ');
      if (this.story && name && name !== `${this.story.given} ${this.story.family}`) {
        this.customName = name;
      }
    } catch { /* the page works without the story */ }
    try {
      this.account = await firstValueFrom(this.http.get<DemoAccount>('assets/config/demo-account.json'));
    } catch { /* no test account in this deployment: the login hint */ }
  }

  get patientName(): string {
    return this.customName || (this.story ? `${this.story.given} ${this.story.family}` : '');
  }

  login() {
    this.starting = true;
    if (!ResumeComponent.peek()) {
      ResumeComponent.remember('/');
    }
    this.auth.login(environment.smart.loginClients[0]);
  }

  async copy(field: 'username' | 'password') {
    try {
      await navigator.clipboard.writeText(this.account?.[field] || '');
      this.copied = field;
      setTimeout(() => this.copied = undefined, 2000);
    } catch { /* clipboard not allowed: the value is on the page */ }
  }
}
