import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";
import {environment} from "../environments/environment";
import {PatientSummaryComponent} from "./patient-summary/patient-summary.component";
import {InterventionsComponent} from "./interventions/interventions.component";
import {CarePlanComponent} from "./care-plan/care-plan.component";

//const routes: Routes = [{ path: '', component: FormComponent },];
const routes: Routes = [
  ...withSmartHandlerRoutes([
    {
      path: 'summary',
      component: PatientSummaryComponent
    },
    {
      path: 'form',
      component: FormComponent
    },
    {
      path: 'results',
      component: ResultsComponent
    },
    {
      path: 'interventions',
      component: InterventionsComponent
    },
    {
      path: 'intervention-plan',
      component: CarePlanComponent
    }
  ], '/summary', 'both', true, environment.smart.shcLoginEnabled),
  {
    path: '',
    redirectTo: '/summary',
    pathMatch: 'full'
  }
]
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})

export class AppRoutingModule { }
