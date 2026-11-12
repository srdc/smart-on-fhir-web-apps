import {FormComponent} from './form.component';
import {of} from 'rxjs';
import catalog from '../../assets/study/study_cases.json';

describe('FormComponent', () => {
  it('navigates a study case to frozen inspection without calling CDS', async () => {
    const cds = jasmine.createSpyObj('CdsHooksService', ['callService']);
    const router = jasmine.createSpyObj('Router', ['navigate']);
    router.navigate.and.resolveTo(true);
    const progress = jasmine.createSpyObj('StudyProgressService', ['beginInspection']);
    progress.beginInspection.and.returnValue(of({phase: 'inspection'}));
    const component = new FormComponent(
      {} as any,
      cds,
      router,
      {} as any,
      {} as any,
      {menuItems: []} as any,
      progress,
      {} as any
    );
    component.studyCaseMode = true;
    (component as any).studyCaseId = 'A1';

    await component.save();

    expect(cds.callService).not.toHaveBeenCalled();
    expect(progress.beginInspection).toHaveBeenCalledOnceWith('A1');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/study/cases', 'A1', 'inspection']);
  });

  it('copies a validated frozen case patient and source-backed answers into the study form', async () => {
    const http = jasmine.createSpyObj('HttpClient', ['get']);
    http.get.and.returnValue(of({item: []}));
    const progress = jasmine.createSpyObj('StudyProgressService', ['loadCase']);
    progress.loadCase.and.returnValue(of({}));
    const stimuli = jasmine.createSpyObj('StudyCaseStimulusService', ['getCase']);
    stimuli.getCase.and.returnValue(of({source: 'frozen', case: catalog.cases.A1, catalogVersion: catalog.catalogVersion}));
    const component = new FormComponent(
      http,
      jasmine.createSpyObj('CdsHooksService', ['callService']),
      jasmine.createSpyObj('Router', ['navigate']),
      {snapshot: {data: {studyCaseForm: true}, paramMap: {get: () => 'A1'}}} as any,
      {} as any,
      {menuItems: []} as any,
      progress,
      stimuli
    );

    await component.ngOnInit();

    expect(component.patient?.id).toBe(catalog.cases.A1.patientProfile.id);
    expect(component.answers).toEqual(catalog.cases.A1.questionnaireAnswers);
    expect(component.answers['21003']).toBe(69);
    expect(component.prefilledAnswers['21003']).toBeTrue();
  });
});
