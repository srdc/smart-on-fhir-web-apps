import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {DashboardComponent} from "./dashboard/dashboard.component";
import {ApplicationMetadataComponent} from "./application-metadata/application-metadata.component";
import {restoreSessionIfAny} from "./session.guard";

// Public pages (no redirect to the login page): the session is used if there is one
const routes: Routes = [
  ...withSmartHandlerRoutes([{
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [restoreSessionIfAny]
  }, {
    path: 'app/:id',
    component: ApplicationMetadataComponent,
    canActivate: [restoreSessionIfAny]
  }], 'dashboard', 'both', false),
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  }
  ]

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
