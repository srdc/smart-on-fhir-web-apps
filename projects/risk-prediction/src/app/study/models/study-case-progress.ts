export type StudyCaseStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed';

export type StudyCasePhase =
  | 'summary'
  | 'form'
  | 'inspection'
  | 'assessment';

export type StudyBlockId = 'A' | 'B';

export type StudyParticipantStage =
  | 'A'
  | 'POST_A'
  | 'B'
  | 'POST_B'
  | 'COMPARE_ORIENTATION'
  | 'INTERVIEW'
  | 'COMPARE'
  | 'COMPLETE';

export interface StudyAssessmentAnswers {
  p1?: unknown;
  p2?: unknown;
  p3?: unknown;
  p4?: unknown;
  p5?: unknown;
  p6?: unknown;
  s1?: unknown;
}

export interface StudyCaseProgress {
  caseId: string;
  block: StudyBlockId;
  matchedPairId?: string;
  presentationPosition: number;

  // Technical prediction/QR metadata only. This is not the case identity.
  qrId?: string;

  status: StudyCaseStatus;
  phase: StudyCasePhase;
  startedAt: string | null;
  inspectionDurationMs: number;
  evaluationDurationMs: number;
  assessmentAnswers: StudyAssessmentAnswers;
  completedAt: string | null;
}

export interface StudyAssignedCaseOrder {
  A: string[];
  B: string[];
}

export interface StudyPostBlockAnswers {
  nasaRtlx: {
    mentalDemand?: number;
    physicalDemand?: number;
    temporalDemand?: number;
    performance?: number;
    effort?: number;
    frustration?: number;
  };
  sus: {
    q1?: number;
    q2?: number;
    q3?: number;
    q4?: number;
    q5?: number;
    q6?: number;
    q7?: number;
    q8?: number;
    q9?: number;
    q10?: number;
  };
  perceivedExplanationQuality: {
    q1?: number;
    q2?: number;
    q3?: number;
    q4?: number;
    q5?: number;
    q6?: number;
    q7?: number;
    q8?: number;
    q9?: number;
  };
}

export interface StudyDirectComparisonAnswers {
  understandingPreference?: 'charts_only' | 'charts_llm' | 'about_same';
  clinicalPracticePreference?: 'charts_only' | 'charts_llm' | 'either' | 'neither';
  llmAddedValue?: 'often' | 'occasionally' | 'rarely' | 'never';
  llmChartMatch?: 'yes' | 'no';
  llmChartMatchDescription?: string;
  patientExplanationHelp?: 'yes_clearly' | 'somewhat' | 'no' | 'unsure';
  patientExplanationWhy?: string;
}

export interface StudyInterviewAnswers {
  interpretation_change?: string;
  chart_vs_text_use?: string;
  useful_suggested_questions?: string;
  missing_questions?: string;
  unclear_or_misleading?: string;
  overcertainty_wording?: string;
  clinical_improvements?: string;
  inappropriate_information?: string;
  adoption_factors?: string;
  confidence_in_faithfulness?: string;
  patient_explanation_usefulness?: string;
}

export interface StudyParticipantProgress {
  participantId?: string;
  assignmentGroup?: 'XY' | 'YX' | 'legacy';
  currentStage: StudyParticipantStage;
  assignedCaseOrder: StudyAssignedCaseOrder;
  currentCaseId: string | null;
  completedCaseIds: string[];
  postACompleted: boolean;
  postBCompleted: boolean;
  comparisonCompleted: boolean;
  backgroundCompleted: boolean;
  comparisonAnswers?: StudyDirectComparisonAnswers;
  postBlockAnswers: {
    A?: StudyPostBlockAnswers;
    B?: StudyPostBlockAnswers;
  };
  startedAt: string | null;
  completedAt: string | null;
}

export interface StudyBackgroundAnswers {
  ageRange?: 'age_25_34' | 'age_35_44' | 'age_45_54' | 'age_55_plus';
  gender?: 'female' | 'male' | 'other' | 'prefer_not_to_say';
  primarySpecialty?: string;
  yearsSinceQualification?: number;
  currentRole?: 'resident_trainee' | 'specialist' | 'consultant_attending' | 'other';
  currentRoleOther?: string;
  directPatientCareProportion?: 'less_than_25' | '25_50' | '50_75' | 'more_than_75';
  mlRiskPredictionFamiliarity?: number;
  llmFamiliarity?: number;
  priorAiDecisionSupport?: 'yes' | 'no';
  priorShapExposure?: 'yes' | 'no' | 'unsure';
  clinicalRiskCalculatorFrequency?: 'daily' | 'weekly' | 'monthly' | 'rarely' | 'never';
}
