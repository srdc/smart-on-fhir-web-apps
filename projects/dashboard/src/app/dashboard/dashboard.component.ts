import {Component} from '@angular/core';
import {environment} from "../../environments/environment";
import {AppMetadata} from "../../environments/AppMetadata";
import {SmartAuthService} from "ng-smart-on-fhir";

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  sections = environment.appSections;
  selectedApp!: AppMetadata;

  // logged in without a patient (e.g. a clinician logged in to EHR): the apps that need one are not opened
  noPatient = false;

  constructor(auth: SmartAuthService) {
    if (auth.isLoggedIn()) {
      auth.getPatient().then(patient => this.noPatient = !patient);
    }
  }
}
