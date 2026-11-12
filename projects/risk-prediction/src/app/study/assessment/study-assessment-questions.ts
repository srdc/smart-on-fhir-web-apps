export type StudyAssessmentQuestionId =
  | 'p1'
  | 'p2'
  | 'p3'
  | 'p4'
  | 'p5'
  | 'p6'
  | 's1';

export interface StudyAssessmentOption {
  value: string | number;
  label: string;
}

export interface StudyAssessmentQuestion {
  id: StudyAssessmentQuestionId;
  prompt: string;
  type: 'text' | 'single-choice' | 'likert';
  options?: readonly StudyAssessmentOption[];
  endpointLabels?: {
    minimum: string;
    maximum: string;
  };
}

export const STUDY_ASSESSMENT_QUESTIONS: readonly StudyAssessmentQuestion[] = [
  { id: 'p1', prompt: 'Which factor moved this prediction upward the most?', type: 'single-choice' },
  { id: 'p2', prompt: 'Which factor moved this prediction downward the most?', type: 'single-choice' },
  {
    id: 'p3',
    prompt: "Is the baseline shown here the patient's previous or pre-treatment risk, a model reference value, or population prevalence?",
    type: 'single-choice',
    options: [
      { value: 'patient_previous_risk', label: "The patient's previous risk" },
      { value: 'reference_model_output', label: 'A model reference value' },
      { value: 'population_prevalence', label: 'Population prevalence' },
      { value: 'cannot_tell', label: 'Cannot tell from this chart' }
    ]
  },
  {
    id: 'p4',
    prompt: "Is this patient's predicted risk above or below that baseline?",
    type: 'single-choice',
    options: [
      { value: 'above', label: 'Above' },
      { value: 'below', label: 'Below' },
      { value: 'about_same', label: 'About the same' },
      { value: 'cannot_tell', label: 'Cannot tell from this chart' }
    ]
  },
  {
    id: 'p5',
    prompt: '',
    type: 'single-choice',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'cannot_tell', label: 'Cannot tell' }
    ]
  },
  {
    id: 'p6',
    prompt: '',
    type: 'single-choice',
    options: [
      { value: 'measured', label: 'Measured' },
      { value: 'estimated', label: 'Estimated' },
      { value: 'cannot_tell', label: 'Cannot tell from this chart' }
    ]
  }
];

export const STUDY_ASSESSMENT_CONFIDENCE_QUESTION: StudyAssessmentQuestion = {
  id: 's1',
  prompt: 'How confident are you in the answers you just gave?',
  type: 'likert',
  options: [1, 2, 3, 4, 5, 6, 7].map(value => ({
    value,
    label: String(value)
  })),
  endpointLabels: {
    minimum: 'Not at all confident',
    maximum: 'Extremely confident'
  }
};
