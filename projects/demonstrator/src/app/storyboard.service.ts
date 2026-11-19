import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';

/** A generic step of the storyboard (Documents/WP7/Storyboards/_build/content.py, GENERIC_STEPS) */
export interface StoryStep {
  key: StepKey;
  title: string;
  /** what the user (the actor) does */
  actionDescription: string;
  /** what happens behind the screen */
  system: string;
  actor: string;
  actions: string[];
  canSkip: boolean;
}

export type StepKey = 'patient-reported' | 'login' | 'patient-selection' | 'summary' | 'form' | 'diseases' | 'results'
  | 'interventions' | 'plan';

export interface StoryPatient {
  id: string;
  given: string;
  family: string;
  gender: 'female' | 'male';
  birthDate: string;
  age: number;
  stratum: string;
  headline: string;
  background: string;
  visitReason: string;
  summary: string;
  selectionNote: string;
  resultsNote: string;
  focus: string[];
  deselect: string[];
  interventions: { measure: string, goal: string }[];
  findings: { measure: string, value: string, interpretation: string }[];
}

export interface ShapContribution {
  feature: string;
  shap: number;
  value: any;
  imputed: boolean;
}

export interface PatientModelOutput {
  stratum: string;
  predictions: Record<string, number>;
  shap: Record<string, { base: number, p: number, top: ShapContribution[] }>;
}

/** Inputs of the deployed WP6 models (shap-client feature selection), per stratum */
export interface ModelInputs {
  version: string;
  featureSelection: string;
  /** produced: whether the STAGE feature extraction provides the input (else it is always imputed) */
  strata: Record<string, { feature: string, diseases: number, produced: boolean }[]>;
}

/** Readable names of the model inputs that are not measurements (answers of the risk questionnaire, derived values) */
const INPUT_LABELS: Record<string, string> = {
  'Overall health rating_num': 'Overall health rating',
  'Total MET-min/week': 'Physical activity (days and minutes of walking, moderate and vigorous activity)',
  'Frequency of tenseness_num': 'Frequency of tenseness / restlessness',
  'Snoring 0.0__Yes': 'Snoring',
  'Difference phone use_num': 'Phone use',
  'Average total household income before tax_num': 'Household income',
  'Variation in diet_num': 'Variation in diet',
  'fam_cardio': 'Family history of cardiovascular disease',
  'Systolic blood pressure_average': 'Blood pressure (systolic)',
  'Diastolic blood pressure_average': 'Blood pressure (diastolic)'
};

/** The model inputs of a stratum that are not laboratory or device measurements, with readable names */
export function answerInputs(inputs: ModelInputs | undefined, stratum: string): string[] {
  return (inputs?.strata[stratum] || []).filter(i => i.produced).map(i => i.feature)
    .filter(f => !f.endsWith('_missing') && (!f.endsWith(' 0.0') || f.includes('__')) && !f.includes('blood pressure'))
    .map(f => INPUT_LABELS[f] || f.replace(/ 0\.0(__.*)?$|_num$/g, ''));
}

/** The model inputs of a stratum that STAGE does not collect (always imputed), e.g. air pollution */
export function imputedInputs(inputs: ModelInputs | undefined, stratum: string): string[] {
  return (inputs?.strata[stratum] || []).filter(i => !i.produced).map(i => INPUT_LABELS[i.feature] || i.feature.replace(/ 0\.0$|_num$/, ''));
}

/** Exported by scripts/export_storyboard.py from the sources of the storyboard document */
export interface Storyboard {
  /** date the storyboard patients' data is relative to (shifted to today in the copies) */
  anchor: string;
  title: string;
  summary: string[];
  modelText: string[];
  steps: StoryStep[];
  patients: StoryPatient[];
  model: Record<string, PatientModelOutput>;
  modelInputs?: ModelInputs;
}

/** What the screens of the demonstrator show for a step */
export interface StepScreen {
  /** page of the risk-prediction app shown in the frame */
  route?: string;
  /** a partner application, simulated by the demonstrator */
  simulator?: 'abacus' | 'liva';
  /** screenshots of steps the demonstrator does itself (login, patient selection) */
  screenshots?: { src: string, caption: string }[];
  /** what to do in the app to get to the next step */
  hint?: string;
}

export const STEP_SCREENS: Record<StepKey, StepScreen> = {
  'patient-reported': {
    simulator: 'abacus',
    hint: 'Answer a questionnaire again as the patient: the patient summary shows it and the risk questionnaire is ' +
      'prefilled from the latest answers (collect the data from the EHR again there).'
  },
  'login': {
    screenshots: [
      {src: 'assets/storyboard/screenshots/login-select-provider.png', caption: 'Login page of the risk-prediction app'},
      {src: 'assets/storyboard/screenshots/login-onauth.png', caption: 'onAuth login page'}
    ]
  },
  'patient-selection': {
    screenshots: [
      {src: 'assets/storyboard/screenshots/patient-selection-onauth.png', caption: 'Patient selection on onAuth'}
    ]
  },
  'summary': {route: '/summary'},
  'form': {
    route: '/form',
    hint: 'Review the prefilled answers, answer the remaining questions and click Save.'
  },
  'diseases': {
    route: '/diseases',
    hint: 'Choose the diseases and click "Calculate risks".'
  },
  'results': {
    route: '/results',
    hint: 'The results follow "Calculate risks" in the disease selection. Open a disease to see its contributing ' +
      'factors, then continue to intervention planning.'
  },
  'interventions': {
    route: '/interventions',
    hint: 'Select the interventions to propose and click "Suggest Interventions".'
  },
  'plan': {
    route: '/intervention-plan',
    simulator: 'liva',
    hint: 'Accept the suggested goals as the LIVA health coach and record measurements: they appear in the plan.'
  }
};

@Injectable({providedIn: 'root'})
export class StoryboardService {
  private storyboard?: Promise<Storyboard>;

  constructor(private http: HttpClient) {}

  load(): Promise<Storyboard> {
    return this.storyboard ||= firstValueFrom(this.http.get<Storyboard>('assets/storyboard/storyboard.json'));
  }

  async patient(id: string): Promise<StoryPatient | undefined> {
    return (await this.load()).patients.find(p => p.id === id);
  }

  /** The baseline FHIR transaction of a storyboard patient (fixed ids sb-pN-*, PUT) */
  bundle(id: string): Promise<fhir4.Bundle> {
    return firstValueFrom(this.http.get<fhir4.Bundle>(`assets/storyboard/bundles/${id}.json`));
  }
}
