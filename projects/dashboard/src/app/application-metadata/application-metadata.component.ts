import { Component } from '@angular/core';
import {ActivatedRoute} from "@angular/router";
import {environment} from "../../environments/environment";
import {AppMetadata, SmartAppMetadata} from "../../environments/AppMetadata";
import {SmartAuthService} from "ng-smart-on-fhir";

@Component({
  selector: 'app-application-metadata',
  templateUrl: './application-metadata.component.html',
  styleUrl: './application-metadata.component.scss'
})
export class ApplicationMetadataComponent {
  app: AppMetadata|undefined;
  appMetadata: SmartAppMetadata|undefined;
  // logged in without a patient (e.g. a clinician logged in to EHR): the apps that need one are not opened
  noPatient = false;

  constructor(private route: ActivatedRoute, auth: SmartAuthService) {
    if (auth.isLoggedIn()) {
      auth.getPatient().then(patient => this.noPatient = !patient);
    }
    this.route.params.subscribe(params => {
      this.setApp(params['id'])
    })
  }

  private setApp(id: string) {
    this.app = environment.appSections.flatMap(section => section.apps).find(app => app.id === id)
    this.appMetadata = this.app?.metadata || undefined
    console.log(this.app, this.appMetadata)
  }
}
