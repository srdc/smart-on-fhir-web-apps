import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {SmartAuthService, SmartOnFhirService} from 'ng-smart-on-fhir';
import {DemoCopy, DemoPatientService} from '../demo-patient.service';
import {StoryboardService, StoryPatient} from '../storyboard.service';
import {ResumeComponent} from './resume.component';

/**
 * Prepares the story of a storyboard patient: reuses this browser's copy of the patient if it still exists (unless a new
 * one is asked for: ?new=1, or another name: ?given=&family=), else copies the patient, then opens the story.
 */
@Component({
  selector: 'demo-start',
  template: `
    <div class="container py-5" style="max-width: 640px">
      @if (error) {
        <div class="alert alert-danger">
          <p class="mb-2">{{ error }}</p>
          @if (needsUserLogin) {
            <button class="btn btn-primary btn-sm" (click)="loginAgain()">Log in again</button>
          } @else {
            <a class="btn btn-outline-secondary btn-sm" routerLink="/">Back to the patients</a>
          }
        </div>
      } @else {
        <div class="d-flex align-items-center gap-3">
          <span class="spinner-border text-primary" role="status"></span>
          <div>
            <div class="fw-semibold">{{ status }}</div>
            <div class="text-muted small">Each visitor works on a temporary copy of the storyboard patient, so you can
              change anything without affecting the stories. Copies are deleted after a day.</div>
          </div>
        </div>
      }
    </div>
  `
})
export class StartComponent implements OnInit {
  status = 'Preparing the story…';
  error?: string;
  needsUserLogin = false;

  constructor(private route: ActivatedRoute, private router: Router, private storyboard: StoryboardService,
              private demo: DemoPatientService, private sof: SmartOnFhirService, private auth: SmartAuthService) {}

  async ngOnInit() {
    const storyId = this.route.snapshot.paramMap.get('storyId')!;
    const params = this.route.snapshot.queryParamMap;
    try {
      const story = await this.storyboard.patient(storyId);
      if (!story) {
        throw new Error(`There is no storyboard patient ${storyId}.`);
      }
      await this.sof.getClient();
      if (!this.sof.canSelectPatient()) {
        // e.g. logged in to another app with a patient context, or as a patient: the demonstrator selects the patients
        this.needsUserLogin = true;
        throw new Error('The current login is for a single patient. The demonstrator needs a practitioner login ' +
          'without a patient context, to open the patient copies it makes.');
      }
      const name = {given: params.get('given') || undefined, family: params.get('family') || undefined};
      const copy = (params.get('new') || name.given || name.family ? undefined : await this.existingCopy(storyId))
        || await this.create(story, name);
      this.status = 'Opening the patient…';
      if (!await this.demo.select(copy)) {
        throw new Error('The patient copy could not be read from the FHIR repository.');
      }
      await this.router.navigate(['/story', copy.patientId], {replaceUrl: true});
    } catch (err: any) {
      console.error(err);
      this.error = this.error || err?.message || String(err);
    }
  }

  private async existingCopy(storyId: string): Promise<DemoCopy | undefined> {
    for (const copy of this.demo.copies().filter(c => c.storyId === storyId)) {
      this.status = 'Looking for your copy of the patient…';
      if (await this.demo.read(copy)) {
        return copy;
      }
      this.demo.forget(copy.patientId);
    }
    return undefined;
  }

  private create(story: StoryPatient, name: { given?: string, family?: string }): Promise<DemoCopy> {
    this.status = `Copying the record of ${story.given} ${story.family} to the STAGE FHIR repository…`;
    return this.demo.create(story, name);
  }

  loginAgain() {
    ResumeComponent.remember(this.router.url);
    // clearSession is not public in ng-smart-on-fhir 1.3.1; logout() needs a started session
    (<any>this.auth).clearSession();
    this.router.navigate(['/login']);
  }
}
