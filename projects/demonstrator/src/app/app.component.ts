import {Component, OnInit} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {filter} from 'rxjs';
import {SmartAuthService} from 'ng-smart-on-fhir';
import {environment} from '../environments/environment';

@Component({
  selector: 'demo-root',
  template: `
    <a class="visually-hidden-focusable demo-skip" href="#main">Skip to content</a>
    <div class="vh-100 d-flex flex-column">
      <!-- not on the login pages of ng-smart-on-fhir, which fill the screen -->
<!--      <ui-header *ngIf="showHeader" class="flex-shrink-0" [logoSrc]="'assets/stage-circle-white.png'" brandText="STAGE Storyboards"-->
<!--                 [tabs]="[{label: 'Patients', link: '/'}]" [user]="userName" [showLogout]="!!userName"-->
<!--                 [showLogin]="false" (logout)="logout()"></ui-header>-->
      <main id="main" tabindex="-1" class="flex-grow-1 min-h-0 overflow-auto">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AppComponent implements OnInit {
  userName?: string;
  /** not on the login pages of ng-smart-on-fhir, which fill the screen (the login guard navigates there itself) */
  get showHeader(): boolean {
    return !/\/(login|callback)$/.test(window.location.pathname);
  }

  constructor(private auth: SmartAuthService, private router: Router) {
    // the session is started by the pages that need it (the start page is public): show the user of the saved session
    router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => this.userName = this.sessionUser());
  }

  ngOnInit() {
    // the user is saved in the session once a page started it (e.g. the story)
    setInterval(() => this.userName = this.sessionUser(), 2000);
  }

  private sessionUser(): string | undefined {
    try {
      // the user is saved with the session once a page started it; a login without it so far is still a login
      const session = JSON.parse(sessionStorage.getItem('SMART_APPS_SESSION') || localStorage.getItem('SMART_APPS_SESSION') || '{}');
      const name = (<fhir4.Practitioner | fhir4.Patient | undefined>session?.user)?.name?.[0];
      return name ? [...(name.given || []), name.family].filter(Boolean).join(' ')
        : session?.user || session?.method === 'login' ? 'Logged in' : undefined;
    } catch {
      return undefined;
    }
  }

  /** End the session of the demonstrator and the embedded app (they share it), and at onAuth */
  logout() {
    // clearSession is not public in ng-smart-on-fhir 1.3.1; logout() needs a started session
    (<any>this.auth).clearSession();
    const logoutUri = (<any>environment.smart.loginClients[0]).logoutUri;
    if (logoutUri) {
      window.location.href = logoutUri;
    } else {
      this.router.navigate(['/']).then(() => this.userName = undefined);
    }
  }
}
