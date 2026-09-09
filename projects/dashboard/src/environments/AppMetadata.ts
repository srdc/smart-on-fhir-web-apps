export interface SmartAppMetadata {
  smartAppId?: string;
  modelReference?: string;
  modelVersion?: string;
  name?: string;
  version?: string;
  keywords?: string[];
  description?: string;
  category?: string[];
  healthTheme?: string[];
  publisher?: string;
  trlLevel?: string;
  license?: string;
  contactPoint?: string;
  primaryUse?: string;
  secondaryUse?: string;
  intendedUsers?: string;
  contraindications?: string;
  ethicalConsiderations?: string;
  limitations?: string[];
  createdAt?: string;
  createdBy?: string;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  fhirCompatibility?: string;
  landingPage?: string;
  smartLaunchURI?: string;
  redirectURIs?: string[];
  modelCardUrl?: string;
  modelCardPipelineUrl?: string;
}

export interface ModelCardMetadata {

  header?: {
    name?: string;
    version?: string;
    version_date?: string;
    release_stage?: string;
    regulatory_status?: string;
  };

  summary?: string;

  intended_use?: {
    primary?: string;
    target_population?: string;
    human_oversight_required?: boolean;
    human_oversight_description?: string;
  };

  cautioned_out_of_scope_uses?: string[];

  imdrf_risk_classification?: {
    description?: string;
    intended_purpose?: string;
    per_disease?: {
      category_I_non_serious_inform?: string[];
      category_II_serious_inform?: string[];
    };
    note?: string;
  };

  training_data?: {
    source?: string;
    n_participants_total?: number;
    recruitment_period?: string;
    age_range_at_recruitment?: string;
    geographic_scope?: string;
    follow_up_horizon?: string;
    outcome_ascertainment?: string;
    split_strategy?: string;
    healthy_volunteer_bias?: string;
    ethnic_composition?: string;
  };

  known_limitations?: string[];

  multimorbidity?: {
    approach?: string;
    independence_assumption?: string;

    quantities?: {
      expected_condition_count?: string;
      count_distribution?: string;
      probability_at_least?: string;
      pair_ranking?: string;
    };

    risk_output_validated?: string;
    risk_output_rationale?: string;

    pair_evidence?: {
      definition?: string;
      coverage?: string;
      source?: string;
    };

    conditions_withheld?: {
      diseases?: string[];
      rationale?: string;
    };

    causal_sequence_pairs?: {
      note?: string;
    };

    limitations?: string[];
  };

  fairness?: {
    audit_design?: {
      protected_attributes?: string[];
      metrics?: {
        name?: string;
        description?: string;
      }[];
      approach?: string;
    };
    attributes_considered?: {
      sex?: string;
      ethnicity?: string;
      age_group?: string;
    };
    attributes_not_considered?: {
      language?: string;
      sexual_orientation?: string;
      gender_identity?: string;
      disability?: string;
      note?: string;
    };
  };

  validation_status?: {
    internal?: {
      method?: string;
      status?: string;
      bootstrap_resamples?: number;
      confidence_level?: number;
    };
    external_nfbc1966?: {
      cohort?: string;
      n_participants_at_clinical_exam?: number;
      status?: string;
      expected_completion?: string;
    };
    gp_linkage_validation?: {
      description?: string;
      status?: string;
    };
  };

  model_architecture?: {
    default_estimator?: string;
    n_diseases_deployed?: number;
    exception?: {
      disease?: string;
      estimator?: string;
      augmentation?: string;
      rationale?: string;
    };
    feature_selection?: string;
    calibration?: string;
    feature_sets?: {
      srdc_poc?: {
        description?: string;
        n_candidate_features?: number;
      };
      abacus_poc?: {
        description?: string;
        n_candidate_features?: number;
      };
    };
    strata?: string;
  };

  robustness?: {
    variation_sources_tested?: string[];
    variation_sources_not_tested?: string[];
  };

  standards_interoperability?: {
    standard?: string;
    application?: string;
  }[];

  regulatory_landscape?: {
    eu_ai_act?: {
      status?: string;
      classification?: string;
    };
    eu_mdr?: {
      status?: string;
      classification?: string;
    };
    gdpr?: {
      status?: string;
      classification?: string;
    };
  };

  environmental_impact?: {
    tracking_tool?: string;
    note?: string;
    architecture_rationale?: string;
  };

  co_creation?: {
    stakeholder_groups?: string[];
    key_requirements_from_stakeholders?: string[];
    documentation?: string;
  };

  ongoing_maintenance?: {
    monitoring_validity?: string;
    monitoring_fairness?: string;
    update_triggers?: string[];
    auc_reporting_threshold?: number;
    auc_reporting_rationale?: string;
    deployment_selection_basis?: string;
  };

  security_compliance?: {
    data_processing?: string;
    access_control?: string;
    patient_data?: string;
    gdpr?: string;
  };

  references?: {
    future_ai_guideline?: string;
    chai_model_card_template?: string;
    tripod_reporting?: string;
  };

  funding?: string;

  data_governance?: {
    ukb_application?: string;
    ub_controller_status?: string;
    data_sharing_constraints?: string;
    nfbc_validation?: string;
  };

}
export interface AppMetadata {
  id: string,
  title: string,
  description: string,
  url: string,
  icon?: string,
  img?: string,
  metadata: SmartAppMetadata
}

export interface DiseasePerformance {
  disease: string;

  model_type?: string;

  discrimination?: {
    auc?: number;
    ci_95_lo?: number;
    ci_95_hi?: number;
    bootstrap_resamples?: number;
  };

  meets_report_threshold?: boolean;

  calibration?: {
    method?: string;
    brier_score?: number;
    calibration_slope?: number;
    calibration_intercept_citl?: number;
    eo_ratio?: number;
    hosmer_lemeshow_stat?: number;
    hosmer_lemeshow_p?: number;
  };

  selected_features?: {
    k?: number;
    selection_method?: string;
    features?: string[];
  };
}

export interface FairnessResult {
  disease: string;

  subgroup: string;

  auc?: number | null;

  tpr_at_fpr10?: number | null;

  calibration_slope?: number | null;

  positive_rate?: number | null;

  positive_rate_difference?: number | null;

  n_samples?: number | null;

  n_events?: number;

  stable?: boolean;
}

export interface ModelCardStratum {
  stratum: string;

  sex: string;

  age_group: string;

  feature_set: string;

  per_disease: DiseasePerformance[];

  fairness?: {
    by_age?: FairnessResult[];
    by_ethnicity?: FairnessResult[];
  };

  deployment_policy?: {
    cohort_deployed?: string;
    cohort_rationale?: string;
    risk_output_validated?: string;
    risk_output_rationale?: string;
  };
}

export interface ModelCardPipeline {
  _meta?: {
    generator?: string;
    generated_at?: string;
    pipeline_version?: string;
    tuned?: boolean;
    n_strata?: number;
    n_skipped?: number;
    auc_report_threshold?: number;
    excluded_diseases?: string[];
    description?: string;
  };

  strata?: {
    [stratumName: string]: ModelCardStratum;
  };

  environmental_impact?: {

    total_energy_kwh?: number;

    total_emissions_kg_co2eq?: number;

    total_duration_s?: number;

    per_phase?: {

      train?: {
        energy_kwh?: number;
        emissions_kg_co2eq?: number;
        duration_s?: number;
      };

      posteval?: {
        energy_kwh?: number;
        emissions_kg_co2eq?: number;
        duration_s?: number;
      };

      shap_explain?: {
        energy_kwh?: number;
        emissions_kg_co2eq?: number;
        duration_s?: number;
      };

      fairness_audit?: {
        energy_kwh?: number;
        emissions_kg_co2eq?: number;
        duration_s?: number;
      };
      delta_ci?: {
        energy_kwh?: number;
        emissions_kg_co2eq?: number;
        duration_s?: number;
      };

    };

  };
}