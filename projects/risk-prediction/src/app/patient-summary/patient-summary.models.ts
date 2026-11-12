import {HistoryEvent} from './history/history.types';

export interface PatientSummaryItem {
  primary: string;
  secondary?: string;
  date?: string;
  source?: string;
  linkLabel?: string;
  linkHref?: string;
}

/** Exact view-model consumed by the normal Patient Summary panels and timeline. */
export interface PatientSummarySnapshot {
  conditionItems: PatientSummaryItem[];
  symptomItems: PatientSummaryItem[];
  medicationItems: PatientSummaryItem[];
  familyItems: PatientSummaryItem[];
  labItems: PatientSummaryItem[];
  vitalItems: PatientSummaryItem[];
  lifestyleItems: PatientSummaryItem[];
  surveyItems: PatientSummaryItem[];
  historyEvents: HistoryEvent[];
}
