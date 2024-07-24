import {Component, Injector, OnDestroy, Signal} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {SmartOnFhirService} from "smart-on-fhir";
import {FormsModule} from "@angular/forms";
import {CommonModule} from "@angular/common";
import {HttpClientModule} from "@angular/common/http";
import * as FHIR from 'fhirclient'
import Client from "fhirclient/lib/Client";
import {Subject} from "rxjs";
import {SmartCdsCommonModule} from "../../../common/src/lib/smart-cds-common.module";
import {StatefulCdsService} from "../../../common/src/lib/services";
import {CdsUtils, FhirUtils} from "../../../common/src/lib/utils";

@Component({
  selector: 'advance-root',
  standalone: true,
  imports: [RouterOutlet, FormsModule, CommonModule, HttpClientModule, SmartCdsCommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  title:string = 'advance'
  scores: number[] = [];
  error: string | undefined;
  patient: fhir4.Patient|undefined;

  age: number = 0;

  loadingPatientData: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];

  private client: Client|undefined;
  private destroy$: Subject<void> = new Subject();
  private stateChanged$: Subject<any> = new Subject();

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
      serviceId: 'advance',
      language: 'es',
      client: this.client,
      onPrefetchStateChange: {
        callService: true,
        transformState: (state) => {
          this.scores = []
          this.error = undefined
          return {
            context: {
              patientId: this.patient?.id
            },
            prefetch: CdsUtils.stateToPrefetch(state, this.conceptDefinitions, <fhir4.Patient>this.patient, true)
          }
        },
        handleServiceResponse: (response) => {
          try {
            const advanceObs = <fhir4.Observation>response.cards[0].suggestions[0].actions[0].resource;
            this.scores = [Math.floor((advanceObs?.valueQuantity?.value || 0) * 100) / 100,
              Math.floor((advanceObs?.referenceRange?.at(0)?.high?.value || 0) * 100) / 100]
          } catch (err) {
            if (!response?.cards?.length) {
              this.error = 'Advance cannot be calculated. Make sure all required inputs are provided.'
            }
          }
        },
        handleServiceError: (err) => {
          console.error(err);
          this.error = err?.message || err?.toString() || 'Unknown error';
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

  scoreHandler(score: number):string {
    if(score<0.5) {
      return "<0.5"
    } else if(score > 83){
      return ">83"
    } else {
      return score.toString()
    }
  }
}
