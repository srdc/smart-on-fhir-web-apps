import { Component, Input, Output, EventEmitter } from '@angular/core';
import {Router} from "@angular/router";

@Component({
  selector: 'app-patient-info',
  templateUrl: './patient-info.component.html',
  styleUrls: ['./patient-info.component.css']
})
export class PatientInfoComponent {

  private _patient: fhir4.Patient | undefined;
  @Input() set patient(value: fhir4.Patient | undefined) {
    this._patient = value;
    this.age = (new Date().getFullYear()) - (new Date(<string>this._patient?.birthDate).getFullYear())
  }
  get patient(): fhir4.Patient | undefined {
    return this._patient;
  }

  @Output() logout = new EventEmitter<void>();
  age: number = 0
  launchUrl = sessionStorage.getItem('launchUrl')
  @Input() title: string|undefined;
  @Input() title2: string|undefined;
  @Input() logo: string | undefined;
  /** Route of the patient selection page (PatientSelectComponent), for user logins that can switch patients */
  @Input() selectPatientUrl: string | undefined;

  constructor(private router: Router) {
  }

  async ngOnInit() {
  }

  onLogout() {
    sessionStorage.clear()
    this._patient = undefined;
    this.router.navigate(['/login'])
    this.logout.emit();
  }

  changePatient() {
    if (this.launchUrl) {
      window.location.href = this.launchUrl
    } else if (this.selectPatientUrl) {
      this.router.navigateByUrl(this.selectPatientUrl)
    }
  }
}
