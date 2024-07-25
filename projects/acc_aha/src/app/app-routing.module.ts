import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {smartHandlerRoutes} from "../../../smart-on-fhir/src/public-api";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";

const routes: Routes = [
  {
    path: '',
    component: FormComponent
  },
  {
    path: 'results',
    component: ResultsComponent
  },
  ...smartHandlerRoutes('/', 'both')
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
