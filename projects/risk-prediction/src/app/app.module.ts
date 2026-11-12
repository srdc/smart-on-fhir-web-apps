import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FormComponent } from './form/form.component';
import {SmartCdsCommonModule} from "common";
import {FormsModule} from "@angular/forms";
import {environment} from "../environments/environment";
import {TranslateLoader, TranslateModule} from '@ngx-translate/core';
import {HTTP_INTERCEPTORS, HttpClient, HttpClientModule} from "@angular/common/http";
import {TranslateHttpLoader} from "@ngx-translate/http-loader";
import {QuestionComponent} from "./question/question.component";
import { ResultsComponent } from './results/results.component';
import {ProgressCircleModule, SidebarModule, SummaryPanelModule, HeaderModule} from "ui-components";
import {ChartjsModule} from "@coreui/angular-chartjs";
import { ChatbotComponent } from './chatbot/chatbot.component';
import {MenuService} from "./menu.service";
import {PatientSummaryComponent} from "./patient-summary/patient-summary.component";
import {NgxPaginationModule} from "ngx-pagination";
import {HistorySettingsComponent} from "./patient-summary/history/history-settings.component";
import {PatientHistoryComponent} from "./patient-summary/history/patient-history.component";
import {StudyCaseInspectionComponent} from './study/case-inspection/study-case-inspection.component';
import {StudyAssessmentComponent} from './study/assessment/study-assessment.component';
import {StudyAuthInterceptor} from './study/auth/study-auth.interceptor';
import {ModeEntryComponent} from './mode-entry/mode-entry.component';
import {StudyEntryComponent} from './study/entry/study-entry.component';
import {SmartResumeComponent} from './study/smart/smart-resume.component';
import {ResearcherAuthInterceptor} from './research/researcher-auth.interceptor';
import {StudyCaseProgressIndicatorComponent} from './study/progress/study-case-progress-indicator.component';
import {StudySectionOrientationComponent} from './study/section/study-section-orientation.component';
import {StudyComparisonOrientationComponent} from './study/comparison/study-comparison-orientation.component';
import {StudyInterviewComponent} from './study/interview/study-interview.component';


export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

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
    StudyCaseInspectionComponent,
    StudyAssessmentComponent,
    ModeEntryComponent,
    StudyEntryComponent,
    SmartResumeComponent
    ,StudyCaseProgressIndicatorComponent
    ,StudySectionOrientationComponent
    ,StudyComparisonOrientationComponent
    ,StudyInterviewComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    SmartCdsCommonModule.forRoot(environment),
    FormsModule,
    HttpClientModule,
    ChartjsModule,
    ProgressCircleModule,
    NgxPaginationModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),
    SidebarModule,
    HeaderModule,
    SummaryPanelModule,
  ],
  providers: [
    MenuService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: StudyAuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ResearcherAuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent],

})
export class AppModule {
}
