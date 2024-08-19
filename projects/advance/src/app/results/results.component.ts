import {Component, Injector, OnDestroy, OnInit} from '@angular/core';
import {CdsUtils, StatefulCdsService, CdsDataService} from "common"
import {SmartOnFhirService} from "smart-on-fhir"
import Client from "fhirclient/lib/Client";
import {Subject} from "rxjs";
import * as FHIR from "fhirclient";

@Component({
  selector: 'advance-results',
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

  constructor(public advanceService: CdsDataService, private sof: SmartOnFhirService, private injector: Injector,
              private statefulCdsService: StatefulCdsService) {
  }

  async ngOnInit() {
    this.loadingPatientData = true
    this.client = await FHIR.oauth2.ready()
    this.patient = await this.sof.getPatient()
    await this.advanceService.init(this.client, this.patient, 'advance')
    this.loadingPatientData = false
    this.advanceService.onPrefetchStateChange({
      callService: true,
      transformState: (state) => {
        this.scores = []
        this.error = undefined
        return {
          context: {
            patientId: this.patient?.id
          },
          prefetch: CdsUtils.stateToPrefetch(state, this.advanceService.conceptDefinitions, <fhir4.Patient>this.patient, true)
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
    const state = this.statefulCdsService.getState(this.advanceService.conceptDefinitions)
    const tmpPrefetch = CdsUtils.stateToPrefetch(state, this.advanceService.conceptDefinitions, <fhir4.Patient>this.patient, true)
    const prefetch = CdsUtils.applySuggestions(tmpPrefetch, this.suggestions, this.advanceService.conceptDefinitions)
    this.statefulCdsService.callService({
      serviceId: 'advance',
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
      const advanceCard = response.cards.find((card: any) => card.uuid === 'CVD CARD SCORE')
      const advanceObs = <fhir4.Observation>advanceCard.suggestions[0].actions[0].resource;
      if (updateSuggestions) {
        this.suggestions = response.cards.filter((card: any) => card !== advanceCard)
      }
      this.scores = [Math.floor((advanceObs?.valueQuantity?.value || 0) * 100) / 100,
        Math.floor((advanceObs?.referenceRange?.at(0)?.high?.value || 0) * 100) / 100]
      if (!this.initialScores.length) {
        this.initialScores = this.scores
      }
    } catch (err) {
      if (!response?.cards?.length) {
        this.error = 'ADVANCE cannot be calculated. Make sure all required inputs are provided.'
      }
    }
  }

  private handleServiceError(err: any) {
    console.error(err);
    this.error = err?.message || err?.toString() || 'Unknown error';
  }

  scoreHandler(score: number):string {
    try {
      if(score<0.5) {
        return "<0.5"
      } else if(score > 83){
        return ">83"
      } else {
        return score.toString()
      }
    } catch (Error) {
      return ""
    }

  }
}
