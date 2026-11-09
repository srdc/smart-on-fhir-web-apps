import {Component, OnInit} from '@angular/core';
import {NavigationEnd, Router} from "@angular/router";
import {filter} from "rxjs";
import {SmartAuthService, SmartOnFhirService} from "ng-smart-on-fhir";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'dashboard';
  patient?: fhir4.Patient;
  loggedIn = false;
  sidebarTitle = '';
  sidebarRows: { label: string, value: string }[] = [];
  // login, callback and launch pages of ng-smart-on-fhir: full page, without the header
  smartPage = false;

  constructor(private auth: SmartAuthService, private sof: SmartOnFhirService, private router: Router) {
  }

  ngOnInit() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.smartPage = /^\/(login|callback|launch)\b/.test((<NavigationEnd>e).urlAfterRedirects);
    });
    // resolves once a session is started (restored by the routes' guard, or after login): without one the dashboard
    // stays public
    this.auth.getClient().then(() => this.showSession(), () => undefined);
  }

  login() {
    this.router.navigate(['/login']);
  }

  logout() {
    this.sof.logout();
  }

  private async showSession() {
    const patient = <fhir4.Patient | undefined>await this.auth.getPatient();
    const user = <fhir4.Practitioner | fhir4.Patient | undefined>await this.auth.getUser();
    this.loggedIn = !!patient || !!user;
    if (!this.loggedIn) {
      return;
    }
    const server = this.auth.getClientConfig()?.label;
    this.patient = patient;
    if (patient) {
      this.sidebarTitle = 'Patient Demographics';
      this.sidebarRows = [
        {label: 'Name', value: this.name(patient) || 'N/A'},
        {label: 'Gender', value: patient.gender || 'N/A'},
        {label: 'Birth Date', value: patient.birthDate || 'N/A'},
        {label: 'Age', value: this.calculateAge(patient.birthDate)?.toString() || 'N/A'},
        {label: 'Patient ID', value: patient.id || 'N/A'}
      ];
    } else {
      this.sidebarTitle = 'Logged-in User';
      this.sidebarRows = [
        {label: 'Name', value: (user && this.name(user)) || 'N/A'},
        {label: 'Role', value: user?.resourceType || 'N/A'},
        {label: 'User ID', value: user?.id || 'N/A'},
        {label: 'Patient', value: 'Not selected'}
      ];
    }
    if (server) {
      this.sidebarRows.push({label: 'Logged in to', value: server});
    }
  }

  private name(resource: fhir4.Patient | fhir4.Practitioner): string {
    const name = resource.name?.[0];
    return name?.text || [...(name?.given || []), name?.family].filter(Boolean).join(' ');
  }

  private calculateAge(birthDate?: string): number | null {
    if (!birthDate) return null;

    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();

    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }
}
