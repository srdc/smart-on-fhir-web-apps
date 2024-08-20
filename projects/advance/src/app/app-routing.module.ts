import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "smart-on-fhir";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";

const routes: Routes = withSmartHandlerRoutes([
  {
    path: '',
    component: FormComponent
  },
  {
    path: 'results',
    component: ResultsComponent
  }
], '/', 'both', true);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
