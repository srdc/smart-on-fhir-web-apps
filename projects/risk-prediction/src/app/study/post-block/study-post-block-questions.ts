import {StudyPostBlockAnswers} from '../models/study-case-progress';

export interface NasaRtlxQuestion {
  id: 'mentalDemand' | 'physicalDemand' | 'temporalDemand' | 'performance' | 'effort' | 'frustration';
  title: string;
  prompt: string;
  lowAnchor: string;
  highAnchor: string;
}

export interface RatingQuestion {
  id: `q${number}`;
  prompt: string;
}

export const NASA_RTLX_QUESTIONS: readonly NasaRtlxQuestion[] = [
  {
    id: 'mentalDemand',
    title: 'Mental Demand',
    prompt: "How much mental effort and perceptual activity was required to interpret the model's explanation — thinking, searching the chart, remembering what elements meant?",
    lowAnchor: 'Low',
    highAnchor: 'High'
  },
  {
    id: 'effort',
    title: 'Effort',
    prompt: 'How hard did you have to work to reach that level of understanding?',
    lowAnchor: 'Low',
    highAnchor: 'High'
  },  
  {
    id: 'temporalDemand',
    title: 'Temporal Demand',
    prompt: 'How much time pressure did you feel while working through the cases? Was the pace slow and leisurely, or rapid and frantic?',
    lowAnchor: 'Low',
    highAnchor: 'High'
  }, 
  {
    id: 'performance',
    title: 'Performance',
    prompt: 'How successful do you think you were in understanding how the model reached each prediction? How satisfied are you with that level of understanding?',
    lowAnchor: 'Poor',
    highAnchor: 'Good'
  }, 
  {
    id: 'frustration',
    title: 'Frustration',
    prompt: 'How insecure, discouraged, irritated or stressed did you feel while interpreting the explanations?',
    lowAnchor: 'Low',
    highAnchor: 'High'
  },  
  {
    id: 'physicalDemand',
    title: 'Physical Demand',
    prompt: 'How much physical activity was required (scrolling, hovering, clicking)? Was it easy or demanding, restful or laborious?',
    lowAnchor: 'Low',
    highAnchor: 'High'
  },
];

export const SUS_INSTRUCTION = 'Thinking specifically about the version of the explanation interface you have just used...';

export const SUS_QUESTIONS: readonly RatingQuestion[] = [
  {id: 'q1', prompt: 'I think that I would like to use this system frequently.'},
  {id: 'q2', prompt: 'I found the system unnecessarily complex.'},
  {id: 'q3', prompt: 'I thought the system was easy to use.'},
  {id: 'q4', prompt: 'I think that I would need the support of a technical person to be able to use this system.'},
  {id: 'q5', prompt: 'I found the various functions in this system were well integrated.'},
  {id: 'q6', prompt: 'I thought there was too much inconsistency in this system.'},
  {id: 'q7', prompt: 'I would imagine that most people would learn to use this system very quickly.'},
  {id: 'q8', prompt: 'I found the system very cumbersome to use.'},
  {id: 'q9', prompt: 'I felt very confident using the system.'},
  {id: 'q10', prompt: 'I needed to learn a lot of things before I could get going with this system.'}
];

export const PERCEIVED_QUALITY_QUESTION_TEMPLATES: readonly RatingQuestion[] = [
  {id: 'q1', prompt: 'The {subject} was clear and easy to understand.'},
  {id: 'q2', prompt: 'The {subject} helped me understand why the model produced this prediction.'},
  {id: 'q3', prompt: 'The {subject} provided the information I needed to interpret the prediction.'},
  {id: 'q4', prompt: 'The level of detail was appropriate.'},
  {id: 'q5', prompt: 'The {subject} helped me identify the most important factors influencing the prediction.'},
  {id: 'q6', prompt: 'I had to work out things for myself that it should have made clear.'},
  {id: 'q7', prompt: "I believe the {subject} reflects what actually drove the model's output."},
  {id: 'q8', prompt: 'I suspect the {subject} leaves out things that mattered to the prediction.'},
  {id: 'q9', prompt: 'I feel confident that I understood the {subject} correctly.'}
];

export function perceivedQualityQuestions(block: 'A' | 'B'): RatingQuestion[] {
  const subject = block === 'A' ? 'chart' : 'explanation';
  return PERCEIVED_QUALITY_QUESTION_TEMPLATES.map(question => ({
    ...question,
    prompt: question.prompt.split('{subject}').join(subject)
  }));
}

export const AGREEMENT_SCALE = [1, 2, 3, 4, 5] as const;

export function arePostBlockAnswersComplete(answers: StudyPostBlockAnswers | undefined): boolean {
  if (!answers) {
    return false;
  }
  const nasaValid = NASA_RTLX_QUESTIONS.every(question => {
    const value = answers.nasaRtlx[question.id];
    return Number.isInteger(value) && value! >= 0 && value! <= 100 && value! % 5 === 0;
  });
  const agreementValid = (values: Record<string, number | undefined>, questions: readonly RatingQuestion[]) =>
    questions.every(question => {
      const value = values[question.id];
      return Number.isInteger(value) && value! >= 1 && value! <= 5;
    });
  return nasaValid
    && agreementValid(answers.sus, SUS_QUESTIONS)
    && agreementValid(answers.perceivedExplanationQuality, PERCEIVED_QUALITY_QUESTION_TEMPLATES);
}
