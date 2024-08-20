import {Component, OnDestroy, Signal} from '@angular/core';
import {SmartOnFhirService} from "smart-on-fhir";
import {Subject} from "rxjs";
import {CdsDataService} from "common";
import {Router} from "@angular/router";

@Component({
  selector: 'qrisk2-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent  implements OnDestroy {

  scores: number[] = [];
  error: string | undefined;
  patient: fhir4.Patient|undefined;

  age: number = 0;

  loadingPatientData: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];

  private destroy$: Subject<void> = new Subject();

  constructor(private sof: SmartOnFhirService, private qriskService: CdsDataService,
              private router: Router) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient.birthDate).getFullYear())
    await this.qriskService.init(await this.sof.getClient(), this.patient, 'qrisk')
    this.loadingPatientData = false
  }

}

