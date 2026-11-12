export interface LocalPlotResponse {
  patient_id: string
  model_name: string
  resolved_stratum?: string
  results: Result[]
}

export interface Result {
  disease: string
  prediction: Prediction
  local_shap_table: any
  plots: Plots
}

export interface Prediction {
  /** Optional because frozen calibrated exports may not retain the pre-calibration score. */
  raw_score?: number
  risk_score: number
}

export interface Plots {
  [key: string]: Plot
}

export interface Plot {
  task: string
  version: string
  plot_type: string
  audience: string
  language: string
  model_context: ModelContext
  patient_context: PatientContext
  waterfall_data: WaterfallData
  quality_flags: QualityFlags
}

export interface ModelContext {
  model_name: string
  prediction_target: string
  output_type: string
  output_unit: string
}

export interface PatientContext {
  patient_id: string
  clinical_summary: string
}
export interface WaterfallData {
  baseline_value: number
  final_prediction: number
  top_positive_contributors: Contributor[]
  top_negative_contributors: Contributor[]
  other_features_contribution: number
  num_other_features: number
  num_features_used: number
  num_missing_features: number
  num_imputed_features: number
  /** Optional frozen-study provenance; raw SHAP remains in log-odds. */
  raw_expected_value_log_odds?: number
  raw_other_features_log_odds?: number
  calibrated_prediction?: number
  display_scale?: 'sequential_probability_points' | 'raw_probability' | 'calibrated_logit'
}

export interface Contributor {
  feature_name: string
  display_name: string
  feature_value: string | number | boolean | null
  feature_unit: string
  is_imputed: boolean
  imputed_value: string | number | boolean | null
  model_value: number | null
  shap_value: number
  /** Sequential percentage-point display allocation; raw shap_value is unchanged. */
  display_contribution?: number
}

export interface WaterfallDisplayFactor {
  display_name: string
  provenance?: 'Observed' | 'Estimated'
  display_value?: string
  unit?: string
}

export interface BeeswarmData {
  [key: string]: unknown
}

export interface QualityFlags {
  confidence_level: string
  missingness_warning: boolean
  correlated_features_warning: boolean
  out_of_distribution_warning: boolean
}

export interface ShapExplainPlotResponse {
  session_id: string
  text: string
  suggested_questions: string[]
  is_new_session: boolean
  plot_type: string
  explanation: ShapPlotExplanation
  transformed_from_detailed: boolean
  skip_rag: boolean
}

export interface ShapPlotExplanation {
  plot_overview: string
  one_sentence_summary: string
  what_increases_prediction: string[]
  what_decreases_prediction: string[]
  what_this_does_not_mean: string
  confidence_and_caveats: string[]
}
