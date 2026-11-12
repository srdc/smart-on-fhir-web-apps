import {Component, Injector} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import { CdsBaseComponent, CDSInitializer, CdsDataService, StatefulCdsService } from "common";
import { environment } from "../environments/environment";
import { SmartOnFhirService } from "ng-smart-on-fhir";
import {MenuService} from "./menu.service";
import {filter, finalize} from 'rxjs/operators';
import {StudyAuthService} from './study/auth/study-auth.service';
import {StudyProgressService} from './study/services/study-progress.service';
import {StudySmartContextService} from './study/smart/study-smart-context.service';
import {AppModeService} from './mode-entry/app-mode.service';
import {PatientSummaryShellService} from './patient-summary/patient-summary-shell.service';


@Component({
  selector: 'rp-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})


export class AppComponent extends CdsBaseComponent implements CDSInitializer {
  override serviceName = environment.cds.serviceName;
  sidebarRows: any[] = [];
  studySummarySidebarRows: any[] = [];
  studySummaryRoute = false;
  private clinicalShellInitialized = false;
  readonly studyAuthenticated$ = this.studyAuth.isAuthenticated$;

  get studyMode(): boolean {
    return this.appMode.mode === 'study';
  }

  get riskPredictionMode(): boolean {
    return this.appMode.mode === 'risk_prediction';
  }

  get researchMode(): boolean {
    return this.router.url === '/research' || this.router.url.startsWith('/research/');
  }

  get showPatientSidebar(): boolean {
    return !this.researchMode && ((!this.studyMode && !!this.patient)
      || (this.studyMode && this.studySummaryRoute && this.studySummarySidebarRows.length > 0));
  }

  constructor(override cdsDataService: CdsDataService, override sof: SmartOnFhirService, override injector: Injector,
              override cdsService: StatefulCdsService, public menuService: MenuService,
              private router: Router, public studyAuth: StudyAuthService,
              private studyProgress: StudyProgressService,
              private studySmartContext: StudySmartContextService,
              public appMode: AppModeService,
              private patientSummaryShell: PatientSummaryShellService) {
    super(cdsDataService, sof, injector, cdsService);
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(event => {
      const url = (event as NavigationEnd).urlAfterRedirects;
      this.studySummaryRoute = /^\/study\/cases\/[^/]+\/summary(?:[?#]|$)/.test(url);
      const mode = this.appMode.mode;
      // Researcher administration is a separate authenticated surface and is
      // intentionally independent from clinician application mode.
      if (url === '/research' || url.startsWith('/research/')) {
        return;
      }
      if (mode === null && url !== '/' && url !== '/auth/resume') {
        void this.router.navigateByUrl('/', {replaceUrl: true});
        return;
      }
      if (mode === 'study') {
        if (!url.startsWith('/study') && url !== '/auth/resume') {
          void this.router.navigateByUrl('/study', {replaceUrl: true});
          return;
        }
        if (url.startsWith('/study/') && url !== '/study') {
          this.studySmartContext.clear();
        }
      } else if (mode === 'risk_prediction' && url.startsWith('/study')) {
        void this.router.navigateByUrl('/summary', {replaceUrl: true});
      }
    });
    this.patientSummaryShell.studyPatient$.subscribe(patient => {
      this.studySummarySidebarRows = patient
        ? this.buildSidebarData(patient, this.patientSummaryShell.studyAgeOverride)
        : [];
    });
  }

  studyLogout(): void {
    // Flush the active assessment while its Study token is still valid. The
    // finalizer is the only owner of the Study logout transition.
    this.studyProgress.flushPendingDrafts().pipe(
      finalize(() => {
        this.studyAuth.logout();
        this.studyProgress.clearLocalState(false);
        this.studySmartContext.clear();
        this.appMode.select('study');
        void this.router.navigate(['/study/login'], {replaceUrl: true});
      })
    ).subscribe({error: () => undefined});
  }

  exitStudy(): void {
    // Exit is a single authoritative transition. Flush any active assessment
    // before tearing down its component, then stop timing/subscriptions before
    // clearing auth and mode state. This prevents the destroyed Study shell
    // from racing the navigation to the root selector.
    this.studyProgress.flushPendingDrafts().pipe(
      finalize(() => {
        this.studyProgress.clearLocalState(false);
        this.studyAuth.logout();
        this.studySmartContext.clear();
        this.appMode.clear();
        void this.router.navigate(['/'], {replaceUrl: true});
      })
    ).subscribe({error: () => undefined});
  }

  normalClinicalLogout(): void {
    const currentRunId = sessionStorage.getItem('app_run_id');
    const studySession = {
      accessToken: sessionStorage.getItem('study_access_token'),
      participantId: sessionStorage.getItem('study_participant_id'),
      returnDestination: sessionStorage.getItem('study_smart_return_destination')
    };
    super.logout();
    // SMART clinical logout clears all sessionStorage. Restore the independent
    // mode selection, development-run identity, and unrelated Study session
    // after its synchronous cleanup.
    if (currentRunId) {
      sessionStorage.setItem('app_run_id', currentRunId);
    }
    if (studySession.accessToken) {
      sessionStorage.setItem('study_access_token', studySession.accessToken);
    }
    if (studySession.participantId) {
      sessionStorage.setItem('study_participant_id', studySession.participantId);
    }
    if (studySession.returnDestination) {
      sessionStorage.setItem('study_smart_return_destination', studySession.returnDestination);
    }
    this.appMode.select('risk_prediction');
    void this.router.navigate(['/login'], {replaceUrl: true});
  }

  exitRiskPredictionMode(): void {
    super.logout();
    this.appMode.clear();
    void this.router.navigate(['/'], {replaceUrl: true});
  }

  override async ngOnInit(): Promise<void> {
    console.log('Service name:', this.serviceName);
    console.log('Environment:', environment.cds);

    this.appMode.modeChanges.subscribe(mode => {
      if (mode === 'risk_prediction' && !this.clinicalShellInitialized) {
        this.clinicalShellInitialized = true;
        void this.initializeClinicalShell();
      } else if (mode !== 'risk_prediction') {
        this.clinicalShellInitialized = false;
      }
    });
  }

  private async initializeClinicalShell(): Promise<void> {
    await super.ngOnInit();
    this.prepareSidebarData();
  }

  private calculateAge(birthDate?: string): number | null {
    if (!birthDate) return null;

    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();

    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  private prepareSidebarData() {
    if (!this.patient) return;
    this.sidebarRows = this.buildSidebarData(this.patient);
  }

  private buildSidebarData(patient: fhir4.Patient, ageOverride: number | null = null): any[] {
    return [
      {
        label: 'Name',
        value: patient.name?.[0]?.given?.join(' ') + ' ' + patient.name?.[0]?.family || 'N/A'
      },
      {
        label: 'Gender',
        value: patient.gender || 'N/A'
      },
      {
        label: 'Birth Date',
        value: patient.birthDate || 'N/A'
      },
      {
        label: 'Age',
        value: (ageOverride ?? this.calculateAge(patient.birthDate))?.toString() || 'N/A'
      },
      {
        label: 'Patient ID',
        value: patient.id || 'N/A'
      }
    ];
  }

}
