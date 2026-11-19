import {Component, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {SmartAuthService, SmartOnFhirService} from 'ng-smart-on-fhir';
import {ResumeComponent} from '../start/resume.component';
import {environment} from '../../environments/environment';
import {DemoCopy, DemoPatientService} from '../demo-patient.service';
import {
  answerInputs, imputedInputs, PatientModelOutput, STEP_SCREENS, StepKey, StepScreen, Storyboard, StoryboardService, StoryPatient, StoryStep
} from '../storyboard.service';
import {AppFrameComponent} from './app-frame.component';

/**
 * The story of a patient copy: the steps of the storyboard with what the user does and what happens behind the screen,
 * next to the risk-prediction app (in a frame) or a simulated partner application.
 */
@Component({
  selector: 'demo-story',
  templateUrl: './story.component.html'
})
export class StoryComponent implements OnInit {
  readonly appUrl = environment.demonstrator.riskPredictionUrl;
  readonly screens = STEP_SCREENS;

  storyboard?: Storyboard;
  story?: StoryPatient;
  model?: PatientModelOutput;
  copy?: DemoCopy;
  patient?: fhir4.Patient;
  userName?: string;
  error?: string;
  /** the frame left the app (logout or login in the app) */
  sessionEnded = false;

  step?: StoryStep;
  /** on steps with both the app and a simulator: which one is shown */
  view: 'app' | 'simulator' = 'app';
  showBackground = false;
  /** the Health Monitoring App simulator saved new answers since the risk questionnaire was opened */
  answersChanged = false;
  frameLoaded = false;
  /** model inputs of the patient's stratum that are answers of the risk questionnaire or derived (not measurements) */
  inputs: string[] = [];
  /** model inputs STAGE does not collect (always imputed) */
  imputed: string[] = [];
  inputCount = 0;

  @ViewChild(AppFrameComponent) frame?: AppFrameComponent;

  constructor(private route: ActivatedRoute, private router: Router, private storyboards: StoryboardService,
              private demo: DemoPatientService, private sof: SmartOnFhirService, private auth: SmartAuthService) {}

  async ngOnInit() {
    const patientId = this.route.snapshot.paramMap.get('patientId')!;
    try {
      this.storyboard = await this.storyboards.load();
      await this.sof.getClient();
      this.copy = this.demo.copy(patientId);
      if (!this.copy) {
        throw new Error('This patient copy was not made in this browser. Start the story from the list of patients.');
      }
      this.story = this.storyboard.patients.find(p => p.id === this.copy!.storyId);
      this.model = this.storyboard.model[this.copy.storyId];
      this.patient = await this.demo.select(this.copy);
      if (!this.patient) {
        this.demo.forget(patientId);
        throw new Error('The patient copy does not exist anymore (copies are deleted after a day). Start the story ' +
          'again to get a new copy.');
      }
      ResumeComponent.forget();   // opened, with or without a login before
      const user: any = await this.sof.getUser();
      this.userName = user?.name?.[0] ? [...(user.name[0].given || []), user.name[0].family].filter(Boolean).join(' ') : undefined;
      this.select(this.storyboard.steps[0]);
      DemoPatientService.allowSessionInFrames();
      DemoPatientService.resetAppStateFor(this.patient.id!);
      this.inputs = answerInputs(this.storyboard.modelInputs, this.story!.stratum);
      this.imputed = imputedInputs(this.storyboard.modelInputs, this.story!.stratum);
      this.inputCount = this.storyboard.modelInputs?.strata[this.story!.stratum]?.filter(i => !i.feature.endsWith('_missing')).length || 0;
      this.frameLoaded = true;
    } catch (err: any) {
      console.error(err);
      this.error = err?.message || String(err);
    }
  }

  get steps(): StoryStep[] {
    return this.storyboard?.steps || [];
  }

  get index(): number {
    return this.step ? this.steps.indexOf(this.step) : -1;
  }

  screen(step?: StoryStep): StepScreen {
    return step ? this.screens[step.key] : {};
  }

  /** What the frame shows: the app, a simulator, or the screenshots of steps the demonstrator did itself */
  get showing(): 'app' | 'simulator' | 'screenshots' {
    const screen = this.screen(this.step);
    if (screen.route && screen.simulator) {
      return this.view;
    }
    return screen.route ? 'app' : screen.simulator ? 'simulator' : 'screenshots';
  }

  select(step: StoryStep, view?: 'app' | 'simulator') {
    this.step = step;
    const screen = this.screen(step);
    this.view = view || (screen.route ? 'app' : 'simulator');
    if (screen.route && this.view === 'app') {
      if (step.key === 'form' && this.answersChanged && this.frame?.route === screen.route) {
        // the questionnaire shown was collected before the new answers: load it again
        this.frame.reload();
      } else {
        this.frame?.navigate(screen.route);
      }
    }
  }

  move(delta: number) {
    const next = this.steps[this.index + delta];
    if (next) {
      this.select(next);
    }
  }

  /** The user went to another page in the app: follow with the step of that page */
  onAppRoute(route: string) {
    const key = (Object.keys(this.screens) as StepKey[]).find(k => this.screens[k].route && route.startsWith(this.screens[k].route!));
    const step = key && this.steps.find(s => s.key === key);
    if (step && step !== this.step && this.showing === 'app') {
      this.step = step;
      this.view = 'app';
    }
  }

  onAnswersSaved() {
    this.answersChanged = true;
  }

  onPlanChanged() {
    this.frame?.reload();
  }

  /** A new copy of the storyboard patient, with the name of this copy */
  /** Log in again (the session ended in the frame) and come back to this story */
  loginAgain() {
    ResumeComponent.remember(this.router.url);
    // clearSession is not public in ng-smart-on-fhir 1.3.1
    (<any>this.auth).clearSession();
    this.router.navigate(['/sign-in']);
  }

  restart() {
    const {storyId, name} = this.copy!;
    let {given, family} = this.copy!;
    if (!given && !family && this.story && name !== `${this.story.given} ${this.story.family}`) {
      // copies made before the name was kept in parts
      [given, family] = [name.split(' ')[0], name.split(' ').slice(1).join(' ')];
    }
    this.router.navigate(['/start', storyId], {queryParams: {new: '1', ...(given ? {given} : {}), ...(family ? {family} : {})}});
  }

  simulatorName(step?: StoryStep): string {
    return this.screen(step).simulator === 'liva' ? 'LIVA health coach' : 'Health Monitoring App';
  }

  get initials(): string {
    return (this.copy?.name || '').split(/\s+/).filter(Boolean).map(n => n[0]).slice(0, 2).join('');
  }

  /** The highest risks of the patient in the storyboard document */
  topRisks(n = 5): { disease: string, p: number }[] {
    return Object.entries(this.model?.predictions || {}).map(([disease, p]) => ({disease, p}))
      .sort((a, b) => b.p - a.p).slice(0, n);
  }

  stratum(p: StoryPatient): string {
    return (p.gender === 'female' ? 'Women' : 'Men') + (p.stratum.includes('60plus') ? ' 60 and over' : ' under 60');
  }
}
