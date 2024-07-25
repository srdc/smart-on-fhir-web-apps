import {Component, Injector, OnDestroy, Signal} from '@angular/core';
import {SmartOnFhirService} from "smart-on-fhir";
import * as FHIR from 'fhirclient'
import Client from "fhirclient/lib/Client";
import {Subject} from "rxjs";
import {StatefulCdsService} from "common";
import {ACCAHAService} from "./acc_aha.service";

@Component({
  selector: 'acc_aha-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent  implements OnDestroy {

  scores: number[] = [];
  error: string | undefined;
  patient: fhir4.Patient|undefined;
  title = "acc_aha"

  age: number = 0;

  loadingPatientData: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];

  private client: Client|undefined;
  private destroy$: Subject<void> = new Subject();
  private stateChanged$: Subject<any> = new Subject();

  constructor(private sof: SmartOnFhirService, private acc_ahaService: ACCAHAService,
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
    await this.acc_ahaService.init(this.client, this.patient)
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
}

