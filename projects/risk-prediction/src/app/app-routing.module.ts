import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "ng-smart-on-fhir";
import {FormComponent} from "./form/form.component";
import {ResultsComponent} from "./results/results.component";
import {environment} from "../environments/environment";
import {PatientSummaryComponent} from "./patient-summary/patient-summary.component";
import {StudyCaseInspectionComponent} from "./study/case-inspection/study-case-inspection.component";
import {StudyAssessmentComponent} from "./study/assessment/study-assessment.component";
import {studyCasePhaseGuard} from "./study/guards/study-case-phase.guard";
import {studyStageGuard} from "./study/guards/study-stage.guard";
import {StudyPostBlockComponent} from "./study/post-block/study-post-block.component";
import {StudyCompleteComponent} from "./study/complete/study-complete.component";
import {StudyComparisonComponent} from "./study/comparison/study-comparison.component";
import {StudyLoginComponent} from './study/auth/study-login.component';
import {studyAuthGuard} from './study/auth/study-auth.guard';
import {ModeEntryComponent} from './mode-entry/mode-entry.component';
import {StudyEntryComponent} from './study/entry/study-entry.component';
import {StudyBackgroundComponent} from './study/background/study-background.component';
import {StudySectionOrientationComponent} from './study/section/study-section-orientation.component';
import {StudyComparisonOrientationComponent} from './study/comparison/study-comparison-orientation.component';
import {StudyInterviewComponent} from './study/interview/study-interview.component';
import {SmartResumeComponent} from './study/smart/smart-resume.component';
import {requireRiskPredictionMode, requireStudyMode} from './mode-entry/app-mode.guard';
import {ResearchLoginComponent} from './research/research-login.component';
import {ResearchDashboardComponent} from './research/research-dashboard.component';
import {ResearchParticipantComponent} from './research/research-participant.component';
import {researcherAuthGuard} from './research/researcher-auth.guard';

//const routes: Routes = [{ path: '', component: FormComponent },];
const routes: Routes = [
  {path: '', component: ModeEntryComponent, pathMatch: 'full'},
  {path: 'research/login', component: ResearchLoginComponent},
  {path: 'research/dashboard', component: ResearchDashboardComponent, canActivate: [researcherAuthGuard]},
  {path: 'research/participants/:participantId', component: ResearchParticipantComponent, canActivate: [researcherAuthGuard]},
  {path: 'study', component: StudyEntryComponent, canActivate: [requireStudyMode]},
  {path: 'study/background', component: StudyBackgroundComponent, canActivate: [requireStudyMode, studyAuthGuard]},
  {path: 'study/section/:sectionId', component: StudySectionOrientationComponent, canActivate: [requireStudyMode, studyAuthGuard]},
  {
    path: 'study/login',
    component: StudyLoginComponent,
    canActivate: [requireStudyMode]
  },
  {
    path: 'study/cases/:caseId/summary',
    component: PatientSummaryComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyCasePhaseGuard],
    data: {
      studyPhase: 'summary',
      frozenStudyCase: true,
      studyCaseSummary: true
    }
  },
  {
    path: 'study/cases/:caseId/form',
    component: FormComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyCasePhaseGuard],
    data: {
      studyPhase: 'form',
      frozenStudyCase: true,
      studyCaseForm: true,
      questionnaireAsset: 'assets/lr_study_questionnaire.json'
    }
  },
  {
    path: 'study/cases/:caseId/inspection',
    component: StudyCaseInspectionComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyCasePhaseGuard],
    data: {studyPhase: 'inspection', frozenStudyCase: true}
  },
  {
    path: 'study/cases/:caseId/assessment',
    component: StudyAssessmentComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyCasePhaseGuard],
    data: {studyPhase: 'assessment', frozenStudyCase: true}
  },
  {
    path: 'study/post-a',
    component: StudyPostBlockComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyStageGuard],
    data: {studyStage: 'POST_A', studyBlock: 'A'}
  },
  {
    path: 'study/post-b',
    component: StudyPostBlockComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyStageGuard],
    data: {studyStage: 'POST_B', studyBlock: 'B'}
  },
  {
    path: 'study/compare/orientation',
    component: StudyComparisonOrientationComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyStageGuard],
    data: {studyStage: 'COMPARE_ORIENTATION'}
  },
  {
    path: 'study/compare',
    component: StudyComparisonComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyStageGuard],
    data: {studyStage: 'COMPARE'}
  },
  {
    path: 'study/interview',
    component: StudyInterviewComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyStageGuard],
    data: {studyStage: 'INTERVIEW'}
  },
  {
    path: 'study/complete',
    component: StudyCompleteComponent,
    canActivate: [requireStudyMode, studyAuthGuard, studyStageGuard],
    data: {studyStage: 'COMPLETE'}
  },
  ...withSmartHandlerRoutes([
    {
      path: 'auth/resume',
      component: SmartResumeComponent
    },
    {
      path: 'summary',
      component: PatientSummaryComponent,
      canActivate: [requireRiskPredictionMode]
    },
    {
      path: 'form',
      component: FormComponent,
      canActivate: [requireRiskPredictionMode],
      data: { questionnaireAsset: 'assets/lr_questionnaire.json' }
    },
    {
      path: 'results',
      component: ResultsComponent,
      canActivate: [requireRiskPredictionMode]
    },
  ], '/auth/resume', 'both', true, environment.smart.shcLoginEnabled),
  {
    path: 'study',
    canActivate: [requireStudyMode],
    children: [{path: '**', component: StudyEntryComponent}]
  },
  {
    path: '**',
    redirectTo: '/'
  }
]
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})

export class AppRoutingModule { }
