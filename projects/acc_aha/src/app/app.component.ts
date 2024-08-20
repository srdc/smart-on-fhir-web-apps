import {Component, OnDestroy} from '@angular/core';
import {SmartOnFhirService} from "smart-on-fhir";
import * as FHIR from 'fhirclient'
import {Subject} from "rxjs";
import {CdsDataService} from "common";

@Component({
  selector: 'acc_aha-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent  implements OnDestroy {

  patient: fhir4.Patient|undefined;
  ageValid: boolean = false;

  age: number = 0;

  loadingPatientData: boolean = false;

  private destroy$: Subject<void> = new Subject();

  constructor(private sof: SmartOnFhirService, private acc_ahaService: CdsDataService) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient.birthDate).getFullYear())
    this.ageValid = (this.age >= 40 && this.age <=79)
    await this.acc_ahaService.init(await FHIR.oauth2.ready(), this.patient, 'acc_aha')
    this.loadingPatientData = false
  }

}

