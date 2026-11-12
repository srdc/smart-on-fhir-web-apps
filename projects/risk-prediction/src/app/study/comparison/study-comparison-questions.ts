import {StudyDirectComparisonAnswers} from '../models/study-case-progress';

export type StudyComparisonChoiceId =
  | 'understandingPreference'
  | 'clinicalPracticePreference'
  | 'llmAddedValue'
  | 'llmChartMatch'
  | 'patientExplanationHelp';

export interface StudyComparisonOption {
  value: string;
  label: string;
}

export interface StudyComparisonChoiceQuestion {
  id: StudyComparisonChoiceId;
  prompt: string;
  options: readonly StudyComparisonOption[];
}

export const STUDY_COMPARISON_QUESTIONS: readonly StudyComparisonChoiceQuestion[] = [
  {
    id: 'understandingPreference',
    prompt: 'Which version did you find easier to understand?',
    options: [
      {value: 'charts_only', label: 'Charts only'},
      {value: 'charts_llm', label: 'Charts + LLM explanation'},
      {value: 'about_same', label: 'About the same'}
    ]
  },
  {
    id: 'clinicalPracticePreference',
    prompt: 'Which version would you prefer to have available in clinical practice?',
    options: [
      {value: 'charts_only', label: 'Charts only'},
      {value: 'charts_llm', label: 'Charts + LLM explanation'},
      {value: 'either', label: 'Either'},
      {value: 'neither', label: 'Neither'}
    ]
  },
  {
    id: 'llmAddedValue',
    prompt: 'Did the LLM explanation ever tell you something you could not work out from the charts alone?',
    options: [
      {value: 'often', label: 'Yes, often'},
      {value: 'occasionally', label: 'Yes, occasionally'},
      {value: 'rarely', label: 'Rarely'},
      {value: 'never', label: 'Never'}
    ]
  },
  {
    id: 'llmChartMatch',
    prompt: 'Did you ever doubt whether the LLM explanation matched the chart?',
    options: [
      {value: 'yes', label: 'Yes'},
      {value: 'no', label: 'No'}
    ]
  },
  {
    id: 'patientExplanationHelp',
    prompt: 'Would this system help you explain a prediction to a patient?',
    options: [
      {value: 'yes_clearly', label: 'Yes, clearly'},
      {value: 'somewhat', label: 'Somewhat'},
      {value: 'no', label: 'No'},
      {value: 'unsure', label: 'Unsure'}
    ]
  }
];

export function areComparisonAnswersComplete(
  answers: StudyDirectComparisonAnswers | undefined
): boolean {
  if (!answers || !answers.patientExplanationWhy?.trim()) return false;
  if (answers.llmChartMatch === 'yes' && !answers.llmChartMatchDescription?.trim()) return false;
  return STUDY_COMPARISON_QUESTIONS.every(question =>
    question.options.some(option => option.value === answers[question.id])
  );
}
