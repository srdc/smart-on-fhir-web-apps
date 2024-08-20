import {Component, OnDestroy} from '@angular/core';
import {SmartOnFhirService} from "smart-on-fhir";
import * as FHIR from 'fhirclient'
import {Subject} from "rxjs";
import {CdsDataService} from "common";


@Component({
  selector: 'qrisk3-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent  implements OnDestroy {

  patient: fhir4.Patient|undefined;

  age: number = 0;
  ageValid: number = 0;

  loadingPatientData: boolean = false;

  private destroy$: Subject<void> = new Subject();

  constructor(private sof: SmartOnFhirService, private qrisk3Service: CdsDataService) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient.birthDate).getFullYear())
    this.ageValid = (this.age < 85 && this.age > 24) ? 0 : (this.age < 25 ? 1 : 2)
    await this.qrisk3Service.init(await FHIR.oauth2.ready(), this.patient, 'qrisk3')
    this.loadingPatientData = false
  }


}

