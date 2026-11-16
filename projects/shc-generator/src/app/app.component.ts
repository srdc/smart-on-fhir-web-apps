import {Component, Signal} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {Subject} from "rxjs";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {

  scores: number[] = [];
  error: string | undefined;
  patient: fhir4.Patient|undefined;
  /** User login without a patient context: "Change Patient" opens the patient selection */
  canSelectPatient = false;

  age: number = 0;

  loadingPatientData: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];

  private destroy$: Subject<void> = new Subject();

  constructor(private sof: SmartOnFhirService) {
  }

  ngOnDestroy() {
    this.destroy$.next()
  }

  async ngOnInit() {
    this.loadingPatientData = true;
    this.patient = await this.sof.getPatient()
    this.canSelectPatient = this.sof.canSelectPatient();
    this.age = (new Date().getFullYear()) - (new Date(<string>this.patient?.birthDate).getFullYear())
    this.loadingPatientData = false
  }

  logout() {
    this.patient = undefined
    this.sof.logout()
  }
}
