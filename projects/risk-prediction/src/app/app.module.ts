import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FormComponent } from './form/form.component';
import {SmartCdsCommonModule} from "common";
import {FormsModule} from "@angular/forms";
import {environment} from "../environments/environment";
import {HttpClient, HttpClientModule} from "@angular/common/http";
import {QuestionComponent} from "./question/question.component";
import { ResultsComponent } from './results/results.component';
import {ProgressCircleModule, SidebarModule, SummaryPanelModule, HeaderModule} from "ui-components";
import { ChatbotComponent } from './chatbot/chatbot.component';
import {MenuService} from "./menu.service";
import {PatientSummaryComponent} from "./patient-summary/patient-summary.component";
import {NgxPaginationModule} from "ngx-pagination";
import {HistorySettingsComponent} from "./patient-summary/history/history-settings.component";
import {PatientHistoryComponent} from "./patient-summary/history/patient-history.component";
import {BaseChartDirective, provideCharts, withDefaultRegisterables} from 'ng2-charts';
import { InterventionsComponent } from './interventions/interventions.component';
import {
  CarePlanComponent,
  GoalAcceptanceStatusPipe,
  ObservationRowChartComponent
} from './care-plan/care-plan.component';
import {AddMeasurementDialogComponent} from './care-plan/add-measurement-dialog.component';
import {SharedLinksComponent} from './shared-links/shared-links.component';
import {DiseaseSelectionComponent} from './diseases/disease-selection.component';

@NgModule({
  declarations: [
    AppComponent,
    FormComponent,
    QuestionComponent,
    ResultsComponent,
    ChatbotComponent,
    HistorySettingsComponent,
    PatientHistoryComponent,
    PatientSummaryComponent,
    InterventionsComponent,
    CarePlanComponent,
    GoalAcceptanceStatusPipe,
    ObservationRowChartComponent,
    AddMeasurementDialogComponent,
    SharedLinksComponent,
    DiseaseSelectionComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    SmartCdsCommonModule.forRoot(environment),
    FormsModule,
    HttpClientModule,
    BaseChartDirective,
    ProgressCircleModule,
    NgxPaginationModule,
    SidebarModule,
    HeaderModule,
    SummaryPanelModule,
  ],
  providers: [MenuService, provideCharts(withDefaultRegisterables())],
  bootstrap: [AppComponent],

})
export class AppModule {
}

