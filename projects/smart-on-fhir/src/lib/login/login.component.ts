import { Component } from '@angular/core';
import * as FHIR from 'fhirclient'

@Component({
  selector: 'lib-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  login() {
    FHIR.oauth2.authorize({
      iss: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/',
      redirectUri: 'http://localhost:4200/callback',
      clientId: 'd70cb3b8-8141-494d-b29d-515d7a071495',
      scope: 'patient/*.*'
    }).then(console.log, console.error)
  }
}
