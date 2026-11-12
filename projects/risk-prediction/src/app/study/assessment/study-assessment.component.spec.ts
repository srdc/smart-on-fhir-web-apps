import catalog from '../../../assets/study/study_cases.json';
import {StudyAssessmentComponent} from './study-assessment.component';
import {assignedCasePosition} from '../study-section.config';
import {StudyParticipantProgress} from '../models/study-case-progress';

describe('StudyAssessmentComponent protocol questions', () => {
  function createComponent(): StudyAssessmentComponent {
    return new StudyAssessmentComponent(
      {} as any, {} as any, {isLogoutFlushInProgress: () => false} as any, {} as any, {} as any
    );
  }

  function participant(order: {A: string[]; B: string[]}): StudyParticipantProgress {
    return {
      participantId: 'test', currentStage: 'A', assignedCaseOrder: order, currentCaseId: order.A[0],
      completedCaseIds: [], postACompleted: false, postBCompleted: false,
      comparisonCompleted: false, backgroundCompleted: true, postBlockAnswers: {},
      startedAt: null, completedAt: null
    };
  }

  it('keeps rank-specific P1/P2 keys while excluding prompt factors from canonical options', () => {
    Object.values(catalog.cases).forEach(frozenCase => {
      (['p1', 'p2'] as const).forEach(questionId => {
        const config = frozenCase.assessmentConfig[questionId];
        expect(config.excludedFeatures.length).toBe(config.answerRank - 1);
        expect(config.prompt).toContain('Apart from ');
        expect(config.prompt).toContain(questionId === 'p1' ? 'increasing the predicted risk' : 'decreasing the predicted risk');
        expect(config.options).toContain(config.correctAnswer);
        expect(config.options).toContain('Cannot tell from this chart');
        config.excludedFeatures.forEach(feature => expect(config.options).not.toContain(feature));
        expect(new Set(config.options).size).toBe(config.options.length);
        config.options.filter(option => option !== 'Cannot tell from this chart').forEach(option => {
          expect((config.optionLabels as Record<string, string> | undefined)?.[option]).toBeTruthy();
        });
        const target = frozenCase.prediction.results.find(result => result.disease === frozenCase.targetDisease)!;
        const contributors = [
          ...target.plots.waterfall.waterfall_data.top_positive_contributors,
          ...target.plots.waterfall.waterfall_data.top_negative_contributors
        ];
        config.options.filter(option => option !== 'Cannot tell from this chart').forEach(option => {
          const contributor = contributors.find(item => item.feature_name === option)!;
          expect((config.optionLabels as Record<string, string> | undefined)?.[option])
            .toBe(contributor.display_name);
        });
      });
    });
  });

  it('preserves all eight canonical P1/P2 answer keys', () => {
    const expected = {
      A1: ['HbA1c 0.0', 'Systolic blood pressure_average'],
      B1: ['Age completed full-time education 0.0', 'Age 0.0'],
      A2: ['Forced vital capacity (FVC) 0.0', 'Reticulocyte percentage 0.0'],
      B2: ['BMI 0.0', 'Cigarettes per day combined'],
      A3: ['Mood swings 0.0__Yes', 'Waist-to-hip ratio'],
      B3: ['Age 0.0', 'Total protein 0.0'],
      A4: ['HDL cholesterol 0.0', 'Age 0.0'],
      B4: ['pain_musculoskeletal', 'Aspartate aminotransferase 0.0']
    } as const;

    Object.entries(expected).forEach(([caseId, [p1, p2]]) => {
      const config = (catalog.cases as Record<string, any>)[caseId].assessmentConfig;
      expect(config.p1.correctAnswer).toBe(p1);
      expect(config.p2.correctAnswer).toBe(p2);
    });
  });

  it('keeps visible question labels tied to stable question IDs when P3 is absent', () => {
    const component = createComponent();
    (component as any).configureQuestions(catalog.cases.A2 as any, false);

    expect(component.questions.map(question => component.questionLabel(question.id)))
      .toEqual(['P1', 'P2', 'P4', 'P5', 'P6']);
  });

  it('shows P3 only at assigned position one for both XY and YX orders', () => {
    const assignments = [
      {A: ['A1', 'A2', 'A3', 'A4'], B: ['B1', 'B2', 'B3', 'B4']},
      {A: ['B1', 'B2', 'B3', 'B4'], B: ['A1', 'A2', 'A3', 'A4']}
    ];
    assignments.forEach(order => {
      const current = participant(order);
      (['A', 'B'] as const).forEach(block => {
        order[block].forEach((caseId, index) => {
          const component = createComponent();
          (component as any).configureQuestions(
            (catalog.cases as Record<string, unknown>)[caseId],
            assignedCasePosition(current, block, caseId).number === 1
          );
          expect(component.questions.some(question => question.id === 'p3'))
            .withContext(`${caseId} in block ${block}`).toBe(index === 0);
        });
      });
    });
  });

  it('omits P3 from a non-first submission instead of requiring or fabricating it', () => {
    const component = createComponent();
    (component as any).configureQuestions(catalog.cases.A2 as any, false);
    component.answers = {p1: 'a', p2: 'b', p3: null, p4: 'above', p5: 'no', p6: 'measured', s1: 5};

    const answers = (component as any).toStudyAssessmentAnswers();
    expect(answers.p3).toBeUndefined();
    expect(component.questions.some(question => question.id === 'p3')).toBeFalse();
  });

  it('converts the confidence radio value to the strict numeric API type', () => {
    const component = createComponent();
    component.answerChanged('s1', '6');

    expect(component.answers.s1).toBe(6);
    expect((component as any).toStudyAssessmentAnswers().s1).toBe(6);
  });
});
