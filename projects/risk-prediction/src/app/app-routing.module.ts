import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";
import {environment} from "../environments/environment";
import {PatientSummaryComponent} from "./patient-summary/patient-summary.component";
import {InterventionsComponent} from "./interventions/interventions.component";
import {CarePlanComponent} from "./care-plan/care-plan.component";
import {SharedLinksComponent} from "./shared-links/shared-links.component";
import {DiseaseSelectionComponent} from "./diseases/disease-selection.component";
import {PatientSelectComponent} from "common";

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
      // between the saved questionnaire and the results: choose the diseases to calculate the risk for
      path: 'diseases',
      component: DiseaseSelectionComponent
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
    },
    {
      path: 'shared-links',
      component: SharedLinksComponent
    },
    {
      // select a patient (user logins without a patient context): import their Smart Health Card/Link or choose one in the record
      path: 'import',
      component: PatientSelectComponent,
      data: {openPatientUrl: 'summary'}
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
