import {Component, Injector} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {filter} from 'rxjs';
import {CdsBaseComponent, CdsDataService, CDSInitializer, StatefulCdsService} from "common";
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {environment} from "../environments/environment";

@Component({
  selector: 'qrisk3-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent extends CdsBaseComponent implements CDSInitializer {
  override serviceName = environment.cds.serviceName;
  ageValid: number = 0;
  /** User login without a patient context (e.g. a clinician at EHR): patients are selected on /select-patient */
  canSelectPatient = false;
  /** Logged in, but no patient selected yet */
  noPatient = false;

  constructor(override cdsDataService: CdsDataService, override sof: SmartOnFhirService, override injector: Injector,
              override cdsService: StatefulCdsService, private router: Router) {
    super(cdsDataService, sof, injector, cdsService);
  }

  override async ngOnInit() {
    // without a patient there is nothing to calculate: select one first (also after the login callback redirects)
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.redirectToPatientSelection(event.urlAfterRedirects));
    const [patient, user] = await Promise.all([this.sof.getPatient(), this.sof.getUser()]);
    this.canSelectPatient = this.sof.canSelectPatient();
    if (!patient && user && this.canSelectPatient) {
      this.noPatient = true;
      this.redirectToPatientSelection(this.router.url);
      return;
    }
    await super.ngOnInit();
    this.ageValid = (this.age < 85 && this.age > 24) ? 0 : (this.age < 25 ? 1 : 2)
  }

  private redirectToPatientSelection(url: string) {
    if (this.noPatient && !/^\/(select-patient|login|callback|launch|shc|shl)\b/.test(url)) {
      this.router.navigate(['/select-patient']);
    }
  }

}

