import {Component, Injector, OnDestroy, OnInit} from '@angular/core';
import {StatefulCdsService} from "common";
import * as FHIR from "fhirclient";
import Client from "fhirclient/lib/Client";
import {SmartOnFhirService} from "smart-on-fhir";
import {Subject} from "rxjs";
import {ACCAHAService} from "../acc_aha.service";

@Component({
  selector: 'acc_aha-form',
  templateUrl: './form.component.html',
  styleUrl: './form.component.scss'
})
export class FormComponent implements OnInit, OnDestroy {
  loadingPatientData: boolean = false;
  private client: Client|undefined;
  private patient: fhir4.Patient|undefined;
  private destroy$: Subject<void> = new Subject();
  valid = false

  constructor(public accahaService: ACCAHAService, private sof: SmartOnFhirService, private injector: Injector,
              private statefulCdsService: StatefulCdsService) {
  }

  async ngOnInit() {
    this.loadingPatientData = true
    this.client = await FHIR.oauth2.ready()
    this.patient = await this.sof.getPatient()
    await this.accahaService.init(this.client, this.patient)
    this.loadingPatientData = false
    this.accahaService.onPrefetchStateChange({
      callService: false,
      //   transformState: (state) => {
      //   this.scores = []
      //   this.error = undefined
      //   return {
      //     context: {
      //       patientId: this.patient?.id
      //     },
      //     prefetch: CdsUtils.stateToPrefetch(state, this.conceptDefinitions, <fhir4.Patient>this.patient, true)
      //   }
      // },
      //   handleServiceResponse: (response) => {
      //   try {
      //     const accahaObs = <fhir4.Observation>response.cards[0].suggestions[0].actions[0].resource;
      //     this.scores = [Math.floor((qriskObs?.valueQuantity?.value || 0) * 100) / 100,
      //       Math.floor((accahaObs?.referenceRange?.at(0)?.high?.value || 0) * 100) / 100]
      //   } catch (err) {
      //     if (!response?.cards?.length) {
      //       this.error = 'ACC/AHA cannot be calculated. Make sure all required inputs are provided.'
      //     }
      //   }
      // },
      //   handleServiceError: (err) => {
      //   console.error(err);
      //   this.error = err?.message || err?.toString() || 'Unknown error';
      // },
      handleState: (state) => {
        this.valid = this.accahaService
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
    this.accahaService.resetState()
  }
}

