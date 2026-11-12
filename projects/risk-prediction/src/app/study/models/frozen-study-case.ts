import type * as fhir4 from 'fhir/r4';
import {LocalPlotResponse} from '../../results/llm-models';
import {StudyBlockId} from './study-case-progress';
import {PatientSummarySnapshot} from '../../patient-summary/patient-summary.models';

export type FrozenQuestionnaireAnswer = number | string | Array<number | string>;
export type FrozenQuestionnaireAnswers = Record<string, FrozenQuestionnaireAnswer>;

export interface FrozenDiseaseExplanationAssets {
  beeswarmImage: string;
  beeswarmData: string;
}

export interface FrozenPredictionSnapshotMetadata {
  status: 'complete' | 'development-partial';
  /** Deployed diseases for prediction.resolved_stratum, captured from STAGE artifacts at export time. */
  expectedDiseases: string[];
  source: string;
  generatedAt?: string;
  /** Study-only exports may contain a single target result and two scales. */
  riskScoreScale?: 'calibrated_probability' | 'raw_probability';
  waterfallScale?: 'raw_probability_from_logodds_shap' | 'calibrated_logit';
}

export interface FrozenAssessmentQuestionConfig {
  correctAnswer: string;
  feature?: string;
  /** Display-only label for prompts that do not use selectable options. */
  displayLabel?: string;
  options?: string[];
  /** Display-only labels; options and answer keys remain canonical feature identifiers. */
  optionLabels?: Record<string, string>;
  prompt?: string;
  answerRank?: number;
  excludedFeatures?: string[];
}

export interface FrozenStudyAssessmentConfig {
  p1: FrozenAssessmentQuestionConfig;
  p2: FrozenAssessmentQuestionConfig;
  p3: FrozenAssessmentQuestionConfig;
  p4: FrozenAssessmentQuestionConfig;
  p5: FrozenAssessmentQuestionConfig;
  p6: FrozenAssessmentQuestionConfig;
}

/** Versioned, immutable stimulus contract for the future Study case catalog. */
export interface FrozenStudyCase {
  schemaVersion: 1;
  caseId: string;
  matchedPairId: string;
  condition: StudyBlockId;
  /** Target-only WP6 export; non-study payloads retain the legacy contract. */
  studyOnly?: boolean;
  patientProfile: fhir4.Patient;
  /** Frozen equivalent of the normal PatientSummaryComponent panel/timeline state. */
  patientSummary: PatientSummarySnapshot;
  questionnaireAnswers: FrozenQuestionnaireAnswers;
  /** Study instruction metadata only; it never filters prediction results or assets. */
  targetDisease: string;
  /** Deterministic, case-specific protocol questions derived from targetDisease's waterfall. */
  assessmentConfig: FrozenStudyAssessmentConfig;
  /** Exact LocalPlotResponse returned by the normal prediction/local-plot pipeline. */
  prediction: LocalPlotResponse;
  predictionSnapshot: FrozenPredictionSnapshotMetadata;
  explanationAssets: Record<string, FrozenDiseaseExplanationAssets>;
  integrity: {
    algorithm: 'SHA-256';
    hashScope: string;
    sourceFreezeStatus: string;
    shapTolerance: number;
    maxReconstructionError: number;
    mappingWarnings: string[];
  };
  contentHash: string;
}

export interface FrozenStudyCaseCatalog {
  schemaVersion: 1;
  catalogVersion: string;
  generatedAt?: string;
  cases: Record<string, FrozenStudyCase>;
  integrity: {
    algorithm: 'SHA-256';
    hashScope: string;
    sourceFreezeStatus: string;
    caseCount: number;
  };
  contentHash: string;
}

export type StudyCaseStimulus = {source: 'frozen'; case: FrozenStudyCase; catalogVersion: string};
