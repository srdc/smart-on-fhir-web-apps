import {of} from 'rxjs';
import {PatientSummaryComponent} from './patient-summary.component';

describe('PatientSummaryComponent study flow', () => {
  it('persists the form phase before leaving the frozen case summary', () => {
    const route = {
      snapshot: {
        data: {studyCaseSummary: true},
        paramMap: {get: (key: string) => key === 'caseId' ? 'B1' : null}
      }
    };
    const router = jasmine.createSpyObj('Router', ['navigate']);
    const progress = jasmine.createSpyObj('StudyProgressService', ['beginForm', 'participantFacingError']);
    progress.beginForm.and.returnValue(of({phase: 'form'}));
    const component = new PatientSummaryComponent(
      {} as any, route as any, router, {} as any, {} as any, progress
    );

    component.continueStudyCase();

    expect(progress.beginForm).toHaveBeenCalledOnceWith('B1');
    expect(router.navigate).toHaveBeenCalledOnceWith(
      ['/study/cases', 'B1', 'form'], {replaceUrl: true}
    );
  });

  it('formats frozen summary values and hides their synthetic source label', () => {
    const route = {snapshot: {data: {studyCaseSummary: true}, paramMap: {get: () => 'A1'}}};
    const component = new PatientSummaryComponent(
      {} as any, route as any, {} as any, {} as any, {} as any, {} as any
    );

    const items = (component as any).presentFrozenItems([
      {primary: 'BMI', secondary: '19.648793058415947 kg/m²', source: 'Frozen cohort'},
      {primary: 'Pulse', secondary: '115.99443751264864 beats/min', source: 'Frozen cohort'},
      {primary: 'Age', secondary: '42.6132 years', source: 'Frozen cohort'},
      {primary: 'Smoking status', secondary: 'Previous', source: 'Frozen cohort'}
    ]);

    expect(items).toEqual([
      {primary: 'BMI', secondary: '19.65 kg/m²', source: undefined},
      {primary: 'Pulse', secondary: '116 beats/min', source: undefined},
      {primary: 'Age', secondary: '42 years', source: undefined},
      {primary: 'Smoking status', secondary: 'Previous', source: undefined}
    ]);
  });
});
