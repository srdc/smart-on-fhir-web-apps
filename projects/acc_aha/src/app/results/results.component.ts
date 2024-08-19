import {Component, Injector, OnDestroy, OnInit} from '@angular/core';
import {CdsUtils, StatefulCdsService, CdsDataService} from "common"
import {SmartOnFhirService} from "smart-on-fhir"
import Client from "fhirclient/lib/Client";
import {Subject} from "rxjs";
import * as FHIR from "fhirclient";

@Component({
  selector: 'acc_aha-results',
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

  constructor(public AccAhaService: CdsDataService, private sof: SmartOnFhirService, private injector: Injector,
              private statefulCdsService: StatefulCdsService) {
  }

  async ngOnInit() {
    this.loadingPatientData = true
    this.client = await FHIR.oauth2.ready()
    this.patient = await this.sof.getPatient()
    await this.AccAhaService.init(this.client, this.patient, 'acc_aha')
    this.loadingPatientData = false
    this.AccAhaService.onPrefetchStateChange({
      callService: true,
      transformState: (state) => {
        this.scores = []
        this.error = undefined
        return {
          context: {
            patientId: this.patient?.id
          },
          prefetch: CdsUtils.stateToPrefetch(state, this.AccAhaService.conceptDefinitions, <fhir4.Patient>this.patient, true)
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
    const state = this.statefulCdsService.getState(this.AccAhaService.conceptDefinitions)
    const tmpPrefetch = CdsUtils.stateToPrefetch(state, this.AccAhaService.conceptDefinitions, <fhir4.Patient>this.patient, true)
    const prefetch = CdsUtils.applySuggestions(tmpPrefetch, this.suggestions, this.AccAhaService.conceptDefinitions)
    this.statefulCdsService.callService({
      serviceId: 'acc_aha',
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
      const acc_ahaCard = response.cards.find((card: any) => card.uuid === 'CVD CARD SCORE')
      const acc_ahaObs = <fhir4.Observation>acc_ahaCard.suggestions[0].actions[0].resource;
      if (updateSuggestions) {
        this.suggestions = response.cards.filter((card: any) => card !== acc_ahaCard)
      }
      this.scores = [Math.floor((acc_ahaObs?.valueQuantity?.value || 0) * 100) / 100,
        Math.floor((acc_ahaObs?.referenceRange?.at(0)?.high?.value || 0) * 100) / 100]
      if (!this.initialScores.length) {
        this.initialScores = this.scores
      }
    } catch (err) {
      if (!response?.cards?.length) {
        this.error = 'ACC/AHA cannot be calculated. Make sure all required inputs are provided.'
      }
    }
  }

  private handleServiceError(err: any) {
    console.error(err);
    this.error = err?.message || err?.toString() || 'Unknown error';
  }
}
