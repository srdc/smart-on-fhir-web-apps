import {Component, Inject} from '@angular/core';
import * as FHIR from 'fhirclient'
import {ActivatedRoute} from "@angular/router";
import {SmartOnFhirConfig} from "../smart-on-fhir.module";

@Component({
  selector: 'lib-launch',
  templateUrl: './launch.component.html',
  styleUrl: './launch.component.css'
})
export class LaunchComponent {
  constructor(@Inject('sofConfig') private config: SmartOnFhirConfig,private route: ActivatedRoute) {
    this.route.queryParams.subscribe(params => {
      const iss = decodeURIComponent(params['iss'])
      const clientId = config.clientId || (config.clientIds && config.clientIds[iss])
      sessionStorage.setItem('launchUrl', window.location.href)
      FHIR.oauth2.authorize({
        clientId: clientId,
        iss,
        launch: params['launch'],
        redirectUri: config.redirectUrl
      })
    })
  }
}
