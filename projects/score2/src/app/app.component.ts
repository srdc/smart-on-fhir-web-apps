import {Component, Injector, OnDestroy, Signal} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import Client from "fhirclient/lib/Client";
import {Subject} from "rxjs";
import * as FHIR from "fhirclient";
import {FhirUtils, StatefulCdsService, SmartCdsCommonModule} from "common";
import {SmartOnFhirService} from "smart-on-fhir";
import {NgClass, NgIf, NgStyle} from "@angular/common";
import {CdsUtils} from "../../../common/src/lib/utils";

@Component({
  selector: 'score2-root',
  standalone: true,
  imports: [RouterOutlet, NgIf, SmartCdsCommonModule, NgStyle, NgClass],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {

  score: number = 0;
  error: string | undefined;
  patient: fhir4.Patient|undefined;

  age: number = 0;

  loadingPatientData: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];

  private client: Client|undefined;
  private destroy$: Subject<void> = new Subject();
  private stateChanged$: Subject<any> = new Subject();
  indices: number[] | undefined;
  scoreTable: number[][] | undefined;
  summary: string | undefined;

  constructor(private sof: SmartOnFhirService,
              private injector: Injector, private statefulCdsService: StatefulCdsService) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.client = await FHIR.oauth2.ready()
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient.birthDate).getFullYear())
    this.conceptDefinitions = await this.statefulCdsService.createState({
      patient: this.patient,
      serviceId: 'score2',
      language: 'es',
      client: this.client,
      onPrefetchStateChange: {
        callService: true,
        transformState: (state) => {
          this.score = 0
          this.indices = undefined
          this.error = undefined
          return {
            context: {
              patientId: this.patient?.id
            },
            prefetch: CdsUtils.stateToPrefetch(state, this.conceptDefinitions, <fhir4.Patient>this.patient, true)
          }
        },
        handleServiceResponse: (response) => {
          const observation: fhir4.Observation = response.cards?.at(0)?.suggestions?.at(0)?.actions?.at(0)?.resource
          this.summary = response.cards?.at(0)?.summary;
          if (observation) {
            const table = observation.interpretation?.at(0)?.text
            this.indices = observation.note?.at(0)?.text?.split('|').map(Number)
            this.scoreTable = table?.split('|').map(_ => _.split(",").map(x => Number(x)))
            this.score = observation.valueQuantity?.value || 0
            this.error = undefined
          } else {
            this.scoreTable = undefined;
            this.error = response.cards?.at(0)?.summary || 'Unknown error'
          }
        },
        handleServiceError: (err) => {
          this.scoreTable = undefined;
          console.error(err)
          this.error = err.message || err?.toString()
        },
        handleState: (state) => {
          this.stateChanged$.next(state)
        },
        injector: this.injector,
        takeUntil: this.destroy$
      }
    })
    this.loadingPatientData = false
  }

  logout() {
    const launchUrl =  <string>sessionStorage.getItem('launchUrl')
    sessionStorage.clear()
    window.location.href = launchUrl
  }

  reset() {
    this.statefulCdsService.resetState(this.conceptDefinitions)
  }

  getDangerClass(score: number) {
    if (score < 3) {
      return 'lvl-' + score;
    } else if (score < 5) {
      return 'lvl-3'
    } else if (score < 10) {
      return 'lvl-4'
    } else if (score < 15) {
      return 'lvl-5'
    } else {
      return 'lvl-6'
    }
  }
}
