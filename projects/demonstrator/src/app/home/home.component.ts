import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {environment} from '../../environments/environment';
import {DemoCopy, DemoPatientService} from '../demo-patient.service';
import {Storyboard, StoryboardService, StoryPatient} from '../storyboard.service';

/** Start page (public): the storyboard patients and their stories, the visitor's copies, and making a new patient */
@Component({
  selector: 'demo-home',
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit {
  storyboard?: Storyboard;
  error?: string;
  copies: DemoCopy[] = [];
  expanded?: string;
  loginHint = environment.demonstrator.loginHint;
  /** "Make your own patient": the storyboard patient to copy, and the name of the copy */
  custom = {storyId: '', given: '', family: ''};

  constructor(private storyboards: StoryboardService, private demo: DemoPatientService, private router: Router) {}

  async ngOnInit() {
    this.copies = this.demo.copies();
    try {
      this.storyboard = await this.storyboards.load();
      this.custom.storyId = this.storyboard.patients[0]?.id;
    } catch (err: any) {
      this.error = 'The storyboards could not be loaded: ' + (err?.message || err);
    }
  }

  /** Diseases the models predict for a patient (the storyboard document's output) */
  get diseaseCount(): number {
    return Math.max(0, ...Object.values(this.storyboard?.model || {}).map(m => Object.keys(m.predictions || {}).length));
  }

  scrollTo(event: Event, id: string) {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }

  story(id: string): StoryPatient | undefined {
    return this.storyboard?.patients.find(p => p.id === id);
  }

  /** Stratum of the WP6 models, e.g. Female_under60_srdc_poc: "Women under 60" */
  stratum(p: StoryPatient): string {
    return (p.gender === 'female' ? 'Women' : 'Men') + (p.stratum.includes('60plus') ? ' 60 and over' : ' under 60');
  }

  /** Open the story: login first if needed (the guards of /start remember it for after the login) */
  start(storyId: string, queryParams: Record<string, string> = {}) {
    this.router.navigate(['/start', storyId], {queryParams});
  }

  startCustom() {
    const given = this.custom.given.trim(), family = this.custom.family.trim();
    this.start(this.custom.storyId, {new: '1', ...(given ? {given} : {}), ...(family ? {family} : {})});
  }

  open(copy: DemoCopy) {
    this.router.navigate(['/story', copy.patientId]);
  }
}
