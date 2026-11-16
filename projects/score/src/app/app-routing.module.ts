import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {ScoreRiskComponent} from "./score-risk/score-risk.component";
import {withPatientSelection} from "common";

// withPatientSelection: user logins without a patient context (STAGE "select patient") select or import a patient first
const routes: Routes = withSmartHandlerRoutes(withPatientSelection([{
  path: '',
  component: ScoreRiskComponent
}]), '/', 'both', true);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
