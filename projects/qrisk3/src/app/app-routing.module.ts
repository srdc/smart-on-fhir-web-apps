import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";
import {environment} from "../environments/environment";
import {PatientSelectComponent} from "common";

const routes: Routes = withSmartHandlerRoutes([
  {
    path: '',
    component: FormComponent
  },
  {
    path: 'results',
    component: ResultsComponent
  },
  {
    // user logins without a patient context (e.g. EHR): import the patient's Smart Health Card/Link or choose a patient
    path: 'select-patient',
    component: PatientSelectComponent,
    data: {openPatientUrl: ''}
  }
], '/', 'both', true, environment.smart.shcLoginEnabled);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
