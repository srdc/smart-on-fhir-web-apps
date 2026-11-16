import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PatientSummaryComponent } from './patient-summary/patient-summary.component';
import { withSmartHandlerRoutes } from 'ng-smart-on-fhir';
import { withPatientSelection } from 'common';

const featureRoutes: Routes = [
  { path: 'summary', component: PatientSummaryComponent },
  { path: 'risks',   component: PatientSummaryComponent }
];

// withPatientSelection: user logins without a patient context (STAGE "select patient") select or import a patient first.
// enableShc: /shc and /shl (opening Smart Health Cards/Links), whether or not the login page has the SHC button
const smartRoutes: Routes = withSmartHandlerRoutes(
  withPatientSelection(featureRoutes, 'summary'), '/', 'both', true, true
);

const routes: Routes = [
  ...smartRoutes,
  { path: '', pathMatch: 'full', redirectTo: 'summary' },
  { path: '**', redirectTo: 'summary' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
