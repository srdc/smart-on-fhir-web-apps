import {Component, Inject} from '@angular/core';
import * as FHIR from 'fhirclient'
import {LoginClientConfig, SmartOnFhirConfig} from "../smart-on-fhir.module";

@Component({
  selector: 'lib-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  constructor(@Inject('sofConfig') public config: SmartOnFhirConfig) {
  }

  login(config: LoginClientConfig) {
    FHIR.oauth2.authorize({
      iss: config.iss,
      redirectUri: config.redirectUri,
      clientId: config.clientId,
      scope: config.scope
    }).then(console.log, console.error)
  }
}
