import {Component, OnDestroy} from '@angular/core';
import {SmartOnFhirService} from "smart-on-fhir";
import * as FHIR from 'fhirclient'
import {Subject} from "rxjs";
import {CdsDataService} from "common";

@Component({
  selector: 'advance-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent  implements OnDestroy {

  patient: fhir4.Patient|undefined;
  loadingPatientData: boolean = false;

  private destroy$: Subject<void> = new Subject();

  constructor(private sof: SmartOnFhirService, private advanceService: CdsDataService) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    await this.advanceService.init(await FHIR.oauth2.ready(), this.patient, 'advance')
    this.loadingPatientData = false
  }

}

