import { Component, Input, Output, EventEmitter } from '@angular/core';
import {Router} from "@angular/router";

@Component({
  selector: 'app-patient-info',
  templateUrl: './patient-info.component.html',
  styleUrls: ['./patient-info.component.css']
})
export class PatientInfoComponent {
  @Input() patient: fhir4.Patient | undefined;
  @Output() logout = new EventEmitter<void>();
  age: number = 0
  launchUrl = sessionStorage.getItem('launchUrl')

  constructor(private router: Router) {
  }

  async ngOnInit() {
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient?.birthDate).getFullYear())
  }

  onLogout() {
    sessionStorage.clear()
    this.patient = undefined;
    this.router.navigate(['/login'])
    this.logout.emit();
  }

  changePatient() {
    window.location.href = <string>this.launchUrl
  }
}
