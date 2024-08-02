import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-patient-info',
  templateUrl: './patient-info.component.html',
  styleUrls: ['./patient-info.component.css']
})
export class PatientInfoComponent {
  @Input() patient: fhir4.Patient | undefined;
  @Output() logout = new EventEmitter<void>();
  age: number = 0

  async ngOnInit() {
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient?.birthDate).getFullYear())
  }

  onLogout() {
    this.logout.emit();
  }
}
