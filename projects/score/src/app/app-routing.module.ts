import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "smart-on-fhir";

const routes: Routes = withSmartHandlerRoutes([], '/', 'both', true);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
