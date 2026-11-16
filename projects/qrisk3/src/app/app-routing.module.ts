import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";
import {withPatientSelection} from "common";

// withPatientSelection: user logins without a patient context (STAGE "select patient") select or import a patient first.
// enableShc: /shc and /shl (opening Smart Health Cards/Links), whether or not the login page has the SHC button
const routes: Routes = withSmartHandlerRoutes(withPatientSelection([
  {
    path: '',
    component: FormComponent
  },
  {
    path: 'results',
    component: ResultsComponent
  }
]), '/', 'both', true, true);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
