import { Component } from '@angular/core';
import * as FHIR from 'fhirclient'
import {ActivatedRoute} from "@angular/router";

@Component({
  selector: 'lib-launch',
  templateUrl: './launch.component.html',
  styleUrl: './launch.component.css'
})
export class LaunchComponent {
  constructor(private route: ActivatedRoute) {
    this.route.queryParams.subscribe(params => {
      sessionStorage.setItem('launchUrl', window.location.href)
      FHIR.oauth2.authorize({
        clientId: 'srdc-qrisk',
        iss: params['iss'].replace('http://', 'https://'),
        launch: params['launch'],
        redirectUri: 'http://localhost:4200/callback'
      })
    })
  }
}
