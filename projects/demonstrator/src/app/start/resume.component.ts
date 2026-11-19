import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';

/** Where the user goes after the login: the page that asked for it (ResumeComponent.remember), else the start page */
@Component({
  selector: 'demo-resume',
  template: ''
})
export class ResumeComponent implements OnInit {
  /**
   * localStorage, not sessionStorage: the login pages of onAuth run on the same origin and do not keep the session
   * storage of the demonstrator
   */
  private static readonly NEXT_KEY = 'STAGE_DEMONSTRATOR_NEXT';
  /** a remembered page older than this is not opened any more (an abandoned login) */
  private static readonly MAX_AGE_MS = 30 * 60 * 1000;

  constructor(private router: Router) {}

  /** Open this page (path in the app, e.g. /story/demo-...) after the next login */
  static remember(url: string) {
    try {
      localStorage.setItem(ResumeComponent.NEXT_KEY, JSON.stringify({url, at: Date.now()}));
    } catch { /* storage unavailable: the start page after the login */ }
  }

  /** The page to open after the login (kept until it is opened: the callback may reload the page) */
  static peek(): string | undefined {
    try {
      const next = JSON.parse(localStorage.getItem(ResumeComponent.NEXT_KEY) || 'null');
      return next && Date.now() - next.at < ResumeComponent.MAX_AGE_MS && /^\/[^/]/.test(next.url) ? next.url : undefined;
    } catch {
      return undefined;
    }
  }

  static forget() {
    try {
      localStorage.removeItem(ResumeComponent.NEXT_KEY);
    } catch { /* storage unavailable */ }
  }

  ngOnInit() {
    // not forgotten here: ng-smart-on-fhir may reload the callback page once more after this (checkPatientInToken), and
    // this page then runs again; the story forgets it once it has opened its patient
    this.router.navigateByUrl(ResumeComponent.peek() || '/', {replaceUrl: true});
  }
}
