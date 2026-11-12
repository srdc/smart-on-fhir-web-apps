import {HttpClient} from '@angular/common/http';
import {firstValueFrom, of} from 'rxjs';
import catalog from '../../../assets/study/study_cases.json';
import {FrozenStudyCase, FrozenStudyCaseCatalog} from '../models/frozen-study-case';
import {StudyCaseStimulusService} from './study-case-stimulus.service';

describe('StudyCaseStimulusService WP6 frozen catalog', () => {
  const caseIds = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];
  let service: StudyCaseStimulusService;

  beforeEach(() => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    http.get.and.returnValue(of(catalog as FrozenStudyCaseCatalog));
    service = new StudyCaseStimulusService(http);
  });

  it('loads every WP6 case through the production schema and SHA-256 validation path', async () => {
    const stimuli = await Promise.all(caseIds.map(caseId => firstValueFrom(service.getCase(caseId))));

    expect(stimuli.map(stimulus => stimulus.case.caseId)).toEqual(caseIds);
    expect(stimuli.every(stimulus => stimulus.case.studyOnly)).toBeTrue();
    expect(stimuli.every(stimulus => stimulus.case.explanationAssets
      && Object.keys(stimulus.case.explanationAssets).length === 0)).toBeTrue();
    stimuli.forEach(({case: studyCase}) => {
      expect(studyCase.prediction.results.length).toBeGreaterThan(1);
      expect(studyCase.prediction.results.map(result => result.disease))
        .toEqual(studyCase.predictionSnapshot.expectedDiseases);
      expect(studyCase.prediction.results.some(result => result.disease === studyCase.targetDisease)).toBeTrue();
    });
  });

  it('loads patient snapshots and the source-backed form prefill values', async () => {
    const stimuli = await Promise.all(caseIds.map(caseId => firstValueFrom(service.getCase(caseId))));

    stimuli.forEach(({case: studyCase}) => {
      expect(studyCase.patientProfile.resourceType).toBe('Patient');
      expect(studyCase.patientProfile.id).toBe(studyCase.prediction.patient_id);
      expect(studyCase.patientSummary.historyEvents).toEqual([]);
      expect(studyCase.patientSummary.vitalItems.length).toBeGreaterThan(0);
      expect(studyCase.patientSummary.labItems.length).toBeGreaterThan(0);
      expect(Object.keys(studyCase.questionnaireAnswers).length).toBeGreaterThan(0);
      expect(Number.isInteger(Number(studyCase.questionnaireAnswers['21003']))).toBeTrue();
    });
  });

  it('preserves rank-derived assessment answers and raw-SHAP waterfall reconstruction', async () => {
    const stimuli = await Promise.all(caseIds.map(caseId => firstValueFrom(service.getCase(caseId))));

    stimuli.forEach(({case: studyCase}) => {
      const result = studyCase.prediction.results.find(item => item.disease === studyCase.targetDisease)!;
      const waterfall = result.plots['waterfall'].waterfall_data;
      const positive = waterfall.top_positive_contributors.map(item => item.feature_name);
      const negative = waterfall.top_negative_contributors.map(item => item.feature_name);
      const all = [...waterfall.top_positive_contributors, ...waterfall.top_negative_contributors];
      const name = (item: typeof all[number]) => item.feature_name;
      const config = studyCase.assessmentConfig;
      const expectedP5 = positive.find((feature, index) => index > 0 && feature !== config.p1.feature)
        || positive.find(feature => feature !== config.p1.feature);
      const expectedP6 = all.find(item => !new Set([
        config.p1.feature, config.p2.feature, expectedP5
      ]).has(name(item)));
      const rawScore = result.prediction.raw_score!;
      const rawMargin = Math.log(rawScore / (1 - rawScore));
      const rawShapSum = (result.local_shap_table as Array<{shap_value: number}>)
        .reduce((sum: number, item: {shap_value: number}) => sum + item.shap_value, 0);

      expect(config.p1.feature).toBe(positive[(config.p1.answerRank ?? 1) - 1]);
      expect(config.p2.feature).toBe(negative[(config.p2.answerRank ?? 1) - 1]);
      expect(config.p5.feature).toBe(expectedP5);
      expect(config.p6.feature).toBe(name(expectedP6!));
      expect(waterfall.raw_expected_value_log_odds! + rawShapSum)
        .toBeCloseTo(rawMargin, 10);
    });
  });

  it('embeds clinician-facing labels while retaining canonical assessment values', async () => {
    const a1 = (await firstValueFrom(service.getCase('A1'))).case;
    const a3 = (await firstValueFrom(service.getCase('A3'))).case;
    const target = (studyCase: FrozenStudyCase) => studyCase.prediction.results
      .find(result => result.disease === studyCase.targetDisease)!;
    const a1Features = target(a1).plots['waterfall'].waterfall_data.top_positive_contributors;
    const a3Features = target(a3).plots['waterfall'].waterfall_data.top_positive_contributors;

    expect(a1Features.find(item => item.feature_name === 'Age 0.0')?.display_name).toBe('Age');
    expect(a3Features.find(item => item.feature_name === 'Mood swings 0.0__Yes')?.display_name)
      .toBe('Mood swings = Yes');
    expect(a1.assessmentConfig.p1.correctAnswer).toBe('HbA1c 0.0');
    expect(a1.assessmentConfig.p1.optionLabels?.['HbA1c 0.0']).toBe('HbA1c');
  });
});
