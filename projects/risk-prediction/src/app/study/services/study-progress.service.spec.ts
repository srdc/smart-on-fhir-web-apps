import {of} from 'rxjs';
import {StudyCaseProgress, StudyParticipantProgress} from '../models/study-case-progress';
import {StudyProgressService} from './study-progress.service';

describe('StudyProgressService assessment timing', () => {
  let now: number;
  let visibility: DocumentVisibilityState;
  let visibilityHandler: (() => void) | undefined;
  let persistence: jasmine.SpyObj<any>;
  let service: StudyProgressService;
  let progress: StudyCaseProgress;

  beforeEach(() => {
    now = 0;
    visibility = 'visible';
    spyOn(performance, 'now').and.callFake(() => now);
    progress = {
      caseId: 'B1', block: 'B', matchedPairId: 'pair_1', presentationPosition: 1,
      status: 'in_progress', phase: 'assessment', startedAt: null,
      inspectionDurationMs: 12000, evaluationDurationMs: 0,
      assessmentAnswers: {}, completedAt: null
    };
    const participant: StudyParticipantProgress = {
      participantId: 'P001', currentStage: 'COMPLETE',
      assignedCaseOrder: {A: [], B: []}, currentCaseId: null,
      completedCaseIds: ['B1'], postACompleted: true, postBCompleted: true,
      comparisonCompleted: true, backgroundCompleted: true,
      postBlockAnswers: {}, startedAt: null, completedAt: null
    };
    persistence = jasmine.createSpyObj('HttpStudyProgressPersistence', [
      'getCase', 'updateCase', 'completeCase', 'loadParticipant'
    ], {participantId: 'P001'});
    persistence.getCase.and.returnValue(of({...progress}));
    persistence.updateCase.and.callFake((_caseId: string, update: any) => of({...progress, ...update}));
    persistence.completeCase.and.callFake((_caseId: string, _answers: any, inspection: number, evaluation: number) =>
      of({...progress, status: 'completed', inspectionDurationMs: inspection, evaluationDurationMs: evaluation})
    );
    persistence.loadParticipant.and.returnValue(of(participant));
    const documentMock = {
      get visibilityState() { return visibility; },
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'visibilitychange') visibilityHandler = handler;
      },
      defaultView: {addEventListener: () => undefined, sessionStorage: {getItem: () => 'seen'}}
    } as unknown as Document;
    service = new StudyProgressService(persistence, {} as any, documentMock);
    service.loadCase('B1').subscribe();
    service.enterPhase('B1', 'assessment');
  });

  it('records the full visible assessment interval across draft saves', () => {
    now = 5000;
    service.saveAssessmentDraft('B1', {p1: 'first'}).subscribe();
    now = 12000;
    service.saveAssessmentDraft('B1', {p1: 'first', p2: 'second'}).subscribe();
    now = 17000;
    service.completeCase('B1', {p1: 'first', p2: 'second'}).subscribe();

    const args = persistence.completeCase.calls.mostRecent().args;
    expect(args[2]).toBe(12000);
    expect(args[3]).toBe(17000);
  });

  it('excludes time while the page is hidden', () => {
    now = 7000;
    visibility = 'hidden';
    visibilityHandler?.();
    now = 14000;
    visibility = 'visible';
    visibilityHandler?.();
    now = 17000;
    service.completeCase('B1', {p1: 'first'}).subscribe();

    expect(persistence.completeCase.calls.mostRecent().args[3]).toBe(10000);
  });

  it('flushes the visible inspection interval before logout without counting logged-out time', () => {
    service.leavePhase();
    progress = {...progress, phase: 'inspection', inspectionDurationMs: 12000, evaluationDurationMs: 0};
    persistence.getCase.and.returnValue(of({...progress}));
    persistence.updateCase.and.callFake((_caseId: string, update: any) => of({...progress, ...update}));
    service.loadCase('B1').subscribe();
    service.enterPhase('B1', 'inspection');

    now = 5000;
    service.flushPendingDrafts().subscribe();
    expect(persistence.updateCase.calls.mostRecent().args[1].inspectionDurationMs).toBe(17000);

    service.clearLocalState(false);
    now = 50000;
    expect(persistence.updateCase.calls.mostRecent().args[1].inspectionDurationMs).toBe(17000);
  });
});

describe('StudyProgressService resume routing', () => {
  const participant = (stage: StudyParticipantProgress['currentStage'] = 'B'): StudyParticipantProgress => ({
    participantId: 'P002', currentStage: stage,
    assignedCaseOrder: {A: [], B: ['B1']}, currentCaseId: stage === 'B' ? 'B1' : null,
    completedCaseIds: [], postACompleted: true, postBCompleted: false,
    comparisonCompleted: false, backgroundCompleted: true,
    postBlockAnswers: {}, startedAt: null, completedAt: null
  });

  const caseProgress = (phase: StudyCaseProgress['phase']): StudyCaseProgress => ({
    caseId: 'B1', block: 'B', matchedPairId: 'pair_1', presentationPosition: 1,
    status: 'in_progress', phase, startedAt: null, inspectionDurationMs: 12000,
    evaluationDurationMs: 3000, assessmentAnswers: {}, completedAt: null
  });

  function createService(phase: StudyCaseProgress['phase']): StudyProgressService {
    const persistence = jasmine.createSpyObj('HttpStudyProgressPersistence', [
      'initializeParticipant', 'loadParticipant', 'getCase', 'startCase'
    ], {participantId: 'P002'});
    persistence.initializeParticipant.and.returnValue(of(participant()));
    persistence.loadParticipant.and.returnValue(of(participant()));
    persistence.getCase.and.returnValue(of(caseProgress(phase)));
    const stimuli = jasmine.createSpyObj('StudyCaseStimulusService', ['hasCatalogEntry']);
    stimuli.hasCatalogEntry.and.returnValue(of(true));
    const documentMock = {
      visibilityState: 'visible', addEventListener: () => undefined,
      defaultView: {addEventListener: () => undefined, sessionStorage: {getItem: () => 'seen'}}
    } as unknown as Document;
    return new StudyProgressService(persistence, stimuli, documentMock);
  }

  (['summary', 'form', 'inspection', 'assessment'] as StudyCaseProgress['phase'][]).forEach(phase => {
    it(`resumes login and direct reload at the persisted ${phase} phase`, () => {
      const service = createService(phase);
      const expected = ['/study/cases', 'B1', phase];
      service.resolveAuthenticatedEntryDestination().subscribe(route => expect(route).toEqual(expected));
      service.resolveCurrentDestination().subscribe(route => expect(route).toEqual(expected));
    });
  });

  it('persists every phase in the new-case flow without skipping', () => {
    let current = caseProgress('summary');
    const persistence = jasmine.createSpyObj('HttpStudyProgressPersistence', ['getCase', 'updateCase']);
    persistence.getCase.and.callFake(() => of({...current}));
    persistence.updateCase.and.callFake((_caseId: string, update: Partial<StudyCaseProgress>) => {
      current = {...current, ...update};
      return of({...current});
    });
    const documentMock = {
      visibilityState: 'visible', addEventListener: () => undefined,
      defaultView: {addEventListener: () => undefined, sessionStorage: {getItem: () => 'seen'}}
    } as unknown as Document;
    const service = new StudyProgressService(persistence, {} as any, documentMock);
    service.loadCase('B1').subscribe();

    service.beginInspection('B1').subscribe({error: error => expect(error).toBeTruthy()});
    service.beginForm('B1').subscribe();
    service.beginInspection('B1').subscribe();
    service.beginAssessment('B1').subscribe();

    expect(persistence.updateCase.calls.allArgs().map((args: any[]) => args[1].phase))
      .toEqual(['form', 'inspection', 'assessment']);
    expect(current.phase).toBe('assessment');
    service.beginForm('B1').subscribe({error: error => expect(error).toBeTruthy()});
    expect(persistence.updateCase).toHaveBeenCalledTimes(3);
  });

  it('maps non-case stages to their canonical routes', () => {
    const service = createService('form');
    const routes: Array<[StudyParticipantProgress['currentStage'], string[]]> = [
      ['POST_A', ['/study/post-a']], ['POST_B', ['/study/post-b']],
      ['COMPARE_ORIENTATION', ['/study/compare/orientation']], ['COMPARE', ['/study/compare']],
      ['INTERVIEW', ['/study/interview']], ['COMPLETE', ['/study/complete']]
    ];
    routes.forEach(([stage, expected]) =>
      expect(service['destinationFor'](participant(stage))).toEqual(expected));
  });
});
