import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FormComponent } from './form/form.component';
import { ResultsComponent } from './results/results.component';
import {SmartCdsCommonModule} from "common";
import {AdvanceService} from "./advance.service";
import {FormsModule} from "@angular/forms";

@NgModule({
  declarations: [
    AppComponent,
    FormComponent,
    ResultsComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    SmartCdsCommonModule,
    FormsModule
  ],
  providers: [AdvanceService],
  bootstrap: [AppComponent]
})
export class AppModule { }
