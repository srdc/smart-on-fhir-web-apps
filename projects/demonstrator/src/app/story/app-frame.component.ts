import {Component, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';

/**
 * The risk-prediction app in a frame. It runs on the same origin as the demonstrator: it continues with the SMART
 * session of the demonstrator (the selected patient copy), and the demonstrator follows and changes its page.
 */
@Component({
  selector: 'demo-app-frame',
  template: `<iframe #frame [src]="src" title="STAGE risk-prediction application" (load)="check()"></iframe>`,
  styles: [`
    :host { display: block; height: 100%; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
  `]
})
export class AppFrameComponent implements OnInit, OnDestroy {
  /** Base URL of the app, e.g. https://kroniq.srdc.com.tr/smart-apps/risk-prediction */
  @Input({required: true}) baseUrl!: string;
  /** First page of the app */
  @Input() initialRoute = '/summary';
  /** The page of the app changed (path in the app, e.g. /results) */
  @Output() routeChange = new EventEmitter<string>();
  /** The frame left the app (e.g. logout in the app, or the login page): the session of the demonstrator has ended */
  @Output() left = new EventEmitter<string>();

  @ViewChild('frame', {static: true}) frame!: ElementRef<HTMLIFrameElement>;
  src?: SafeResourceUrl;
  route?: string;
  private basePath = '';
  private timer?: any;

  constructor(private sanitizer: DomSanitizer, private zone: NgZone) {}

  ngOnInit() {
    this.basePath = new URL(this.baseUrl, window.location.href).pathname.replace(/\/$/, '');
    this.src = this.sanitizer.bypassSecurityTrustResourceUrl(this.baseUrl.replace(/\/$/, '') + this.initialRoute);
    // Angular's router changes the page with history.pushState, which fires no event: poll the location of the frame
    this.zone.runOutsideAngular(() => this.timer = setInterval(() => this.check(), 400));
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  private get window(): Window | undefined {
    try {
      const w = this.frame.nativeElement.contentWindow;
      return w && w.location.pathname !== undefined ? w : undefined;
    } catch {
      return undefined;   // another origin (e.g. the login page of onAuth on another host)
    }
  }

  check() {
    const w = this.window;
    const path = w?.location.pathname;
    if (!path || path === 'blank') {
      return;
    }
    if (!path.startsWith(this.basePath)) {
      this.zone.run(() => this.left.emit(path));
      return;
    }
    const route = path.slice(this.basePath.length) || '/';
    if (route !== this.route) {
      this.route = route;
      this.zone.run(() => /^\/(login|callback)\b/.test(route) ? this.left.emit(route) : this.routeChange.emit(route));
    }
  }

  /** Open a page of the app: through its router (keeps the app loaded), else by loading the page */
  navigate(route: string) {
    if (route === this.route) {
      return;
    }
    const w = this.window;
    if (w) {
      w.history.pushState({}, '', this.basePath + route);
      w.dispatchEvent(new PopStateEvent('popstate', {state: {}}));
    } else {
      this.src = this.sanitizer.bypassSecurityTrustResourceUrl(this.baseUrl.replace(/\/$/, '') + route);
    }
  }

  /** Load the current page again (e.g. after the demonstrator changed the data it shows) */
  reload() {
    const w = this.window;
    if (w) {
      w.location.reload();
    }
  }
}
