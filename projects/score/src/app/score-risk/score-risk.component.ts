import {Component, Injector, OnDestroy, OnInit, Signal} from '@angular/core';
import {debounceTime, Subject} from "rxjs";
import {Router} from "@angular/router";
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {StatefulCdsService, CdsUtils} from "common";

@Component({
  selector: 'app-score-risk',
  templateUrl: 'score-risk.component.html',
  styleUrl: 'score-risk.component.scss'
})

export class ScoreRiskComponent implements OnInit, OnDestroy {

  score: number = 0;
  error: string | undefined;
  patient: fhir4.Patient|undefined;
  /** User login without a patient context: "Change Patient" opens the patient selection */
  canSelectPatient = false;

  age: number = 0;

  loadingPatientData: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];

  private destroy$: Subject<void> = new Subject();
  private stateChanged$: Subject<any> = new Subject();
  indices: number[] | undefined;
  scoreTable: number[][] | undefined;
  summary: string | undefined;
  simulated: {
    smoking: { scoreTable: number[][]|undefined, indices: number[]|undefined, score: number|undefined }|undefined,
    sbp: { scoreTable: number[][]|undefined, indices: number[]|undefined, score: number|undefined }|undefined,
    nonHdl: { scoreTable: number[][]|undefined, indices: number[]|undefined, score: number|undefined }|undefined
  } = { smoking: undefined, sbp: undefined, nonHdl: undefined };

  constructor(private sof: SmartOnFhirService, private router: Router,
              private injector: Injector, private statefulCdsService: StatefulCdsService) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    this.canSelectPatient = this.sof.canSelectPatient();
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient?.birthDate).getFullYear())
    this.conceptDefinitions = await this.statefulCdsService.createState({
      patient: this.patient,
      serviceId: 'score2',
      language: 'es',
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
    this.stateChanged$.pipe(debounceTime(1000)).subscribe({
      next: async state => {
        console.log(state)
        const newState = JSON.parse(JSON.stringify(state))
        const callCdsWithNewState = () => this.statefulCdsService.callService({
          serviceId: 'score2',
          language: 'en',
          patient: this.patient
        }, {
          context: {
            patientId: this.patient?.id
          },
          prefetch: CdsUtils.stateToPrefetch(newState, this.conceptDefinitions, <fhir4.Patient>this.patient, true)
        })
        this.simulated.smoking = undefined;
        this.simulated.sbp = undefined;
        this.simulated.nonHdl = undefined;
        if (state['SmokingStatus'] && !['8517006', 'LA18978-9'].includes(state['SmokingStatus'].value?.code)) {
          newState.SmokingStatus.value = {
            code: '8517006',
            system: 'http://loinc.org',
            display: 'Former Smoker'
          }
          const response = await callCdsWithNewState()
          const observation: fhir4.Observation = response.cards?.at(0)?.suggestions?.at(0)?.actions?.at(0)?.resource
          if (observation) {
            const table = observation.interpretation?.at(0)?.text
            this.simulated.smoking = {
              indices: observation.note?.at(0)?.text?.split('|').map(Number),
              scoreTable: table?.split('|').map(_ => _.split(",").map(x => Number(x))),
              score: observation.valueQuantity?.value || 0
            }
            console.log(table, observation.valueQuantity?.value)
          }
        }
        if (newState['BP_SBP'] && newState['BP_SBP'].value?.value > 130) {
          newState['BP_SBP'].value.value = 130;
          const response = await callCdsWithNewState()
          const observation: fhir4.Observation = response.cards?.at(0)?.suggestions?.at(0)?.actions?.at(0)?.resource
          if (observation) {
            const table = observation.interpretation?.at(0)?.text
            this.simulated.sbp = {
              indices: observation.note?.at(0)?.text?.split('|').map(Number),
              scoreTable: table?.split('|').map(_ => _.split(",").map(x => Number(x))),
              score: observation.valueQuantity?.value || 0
            }
            console.log(table, observation.valueQuantity?.value)
          }
        }
        if (newState['HDL'] && newState['TotalCholesterol'] && newState['TotalCholesterol'].value?.value && newState['HDL'].value?.value) {
          const nonHdl =  newState['TotalCholesterol'].value.value - newState['HDL'].value.value;
          if (nonHdl > 130) {
            newState['HDL'].value.value = 50;
            newState['TotalCholesterol'].value.value = 180;
            const response = await callCdsWithNewState()
            const observation: fhir4.Observation = response.cards?.at(0)?.suggestions?.at(0)?.actions?.at(0)?.resource
            if (observation) {
              const table = observation.interpretation?.at(0)?.text
              this.simulated.nonHdl = {
                indices: observation.note?.at(0)?.text?.split('|').map(Number),
                scoreTable: table?.split('|').map(_ => _.split(",").map(x => Number(x))),
                score: observation.valueQuantity?.value || 0
              }
              console.log(table, observation.valueQuantity?.value)
            }
          }
        }
      }
    })
    this.loadingPatientData = false
  }

  logout() {
    // const launchUrl =  <string>sessionStorage.getItem('launchUrl')
    // sessionStorage.clear()
    // if (launchUrl) {
    //   window.location.href = launchUrl
    // } else {
    //   this.patient = undefined;
    //   this.router.navigate(['/login']);
    // }
    this.patient = undefined;
    this.sof.logout()
  }

  reset() {
    this.statefulCdsService.resetState(this.conceptDefinitions)
  }

  getDangerClass(score: number = 0) {
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
