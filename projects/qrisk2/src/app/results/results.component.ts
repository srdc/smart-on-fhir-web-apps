import {Component, Injector, OnDestroy, OnInit} from '@angular/core';
import {CdsUtils, StatefulCdsService} from "common"
import {SmartOnFhirService} from "smart-on-fhir"
import Client from "fhirclient/lib/Client";
import {Subject} from "rxjs";
import {QriskService} from "../qrisk.service";
import * as FHIR from "fhirclient";
import {FhirUtils} from "../../../../common/src/lib/utils";

@Component({
  selector: 'qrisk2-results',
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss'
})
export class ResultsComponent implements OnInit, OnDestroy {
  loadingPatientData: boolean = false;
  private client: Client|undefined;
  private patient: fhir4.Patient|undefined;
  private destroy$: Subject<void> = new Subject();
  valid = false
  initialScores: any[] = [];
  scores: any[] = [];
  error: any;
  suggestions: any[] = [];

  constructor(public qriskService: QriskService, private sof: SmartOnFhirService, private injector: Injector,
              private statefulCdsService: StatefulCdsService) {
  }

  async ngOnInit() {
    this.loadingPatientData = true
    this.client = await FHIR.oauth2.ready()
    this.patient = await this.sof.getPatient()
    await this.qriskService.init(this.client, this.patient)
    this.loadingPatientData = false
    this.qriskService.onPrefetchStateChange({
      callService: true,
      transformState: (state) => {
        this.scores = []
        this.error = undefined
        return {
          context: {
            patientId: this.patient?.id
          },
          prefetch: CdsUtils.stateToPrefetch(state, this.qriskService.conceptDefinitions, <fhir4.Patient>this.patient, true)
        }
      },
      handleServiceResponse: (response) => {
        this.handleServiceResponse(response, true)
      },
      handleServiceError: (err) => {
        this.handleServiceError(err)
      },
      injector: this.injector,
      takeUntil: this.destroy$
    })
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  applySuggestions() {
    const state = this.statefulCdsService.getState(this.qriskService.conceptDefinitions)
    const prefetch = CdsUtils.stateToPrefetch(state, this.qriskService.conceptDefinitions, <fhir4.Patient>this.patient, true)
    this.suggestions.forEach(card => card.suggestions.forEach((suggestion: any) => {
      if (suggestion.apply) {
        const resource: fhir4.Observation = suggestion.actions[0].resource
        const definition = this.qriskService.conceptDefinitions.find((_definition: any) =>
          _definition.code?.code === resource.code?.coding?.at(0)?.code)
        if (definition && prefetch[definition.id]) {
          prefetch[definition.id].total += 1
          prefetch[definition.id].entry.splice(0, 1, {
            resource: resource,
            search: {
              mode: 'match'
            }
          })
        }
      }
    }))
    this.statefulCdsService.callService({
      serviceId: 'qrisk',
      language: 'en',
      client: this.client,
      patient: this.patient
    }, {
      prefetch,
      context: {
        patientId: this.patient?.id
      }
    }).then(response => this.handleServiceResponse(response, false), error => this.handleServiceError(error))
  }

  private handleServiceResponse(response: any, updateSuggestions: boolean) {
    try {
      const qriskCard = response.cards.find((card: any) => card.uuid === 'CVD CARD SCORE')
      const qriskObs = <fhir4.Observation>qriskCard.suggestions[0].actions[0].resource;
      if (updateSuggestions) {
        this.suggestions = response.cards.filter((card: any) => card !== qriskCard)
      }
      this.scores = [Math.floor((qriskObs?.valueQuantity?.value || 0) * 100) / 100,
        Math.floor((qriskObs?.referenceRange?.at(0)?.high?.value || 0) * 100) / 100]
      if (!this.initialScores.length) {
        this.initialScores = this.scores
      }
    } catch (err) {
      if (!response?.cards?.length) {
        this.error = 'QRISK cannot be calculated. Make sure all required inputs are provided.'
      }
    }
  }

  private handleServiceError(err: any) {
    console.error(err);
    this.error = err?.message || err?.toString() || 'Unknown error';
  }
}
