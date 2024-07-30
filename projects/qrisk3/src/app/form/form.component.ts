import {Component, Injector, OnDestroy, OnInit} from '@angular/core';
import {StatefulCdsService} from "common";
import * as FHIR from "fhirclient";
import Client from "fhirclient/lib/Client";
import {SmartOnFhirService} from "smart-on-fhir";
import {Subject} from "rxjs";
import {Qrisk3Service} from "../qrisk3.service";

@Component({
  selector: 'qrisk3-form',
  templateUrl: './form.component.html',
  styleUrl: './form.component.scss'
})
export class FormComponent implements OnInit, OnDestroy {
  loadingPatientData: boolean = false;
  private client: Client|undefined;
  private patient: fhir4.Patient|undefined;
  private destroy$: Subject<void> = new Subject();
  valid = false

  constructor(public qrisk3Service: Qrisk3Service, private sof: SmartOnFhirService, private injector: Injector,
              private statefulCdsService: StatefulCdsService) {
  }

  async ngOnInit() {
    this.loadingPatientData = true
    this.client = await FHIR.oauth2.ready()
    this.patient = await this.sof.getPatient()
    await this.qrisk3Service.init(this.client, this.patient)
    this.loadingPatientData = false
    this.qrisk3Service.onPrefetchStateChange({
      callService: false,
      handleState: (state) => {
        this.valid = this.qrisk3Service
          .conceptDefinitions?.every(definition => !definition.required
            || state[definition.id].value?.value || state[definition.id].value?.code)
        console.log(state)
        console.log(this.statefulCdsService)
      },
      injector: this.injector,
      takeUntil: this.destroy$
    })
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  reset() {
    this.qrisk3Service.resetState()
  }
}

