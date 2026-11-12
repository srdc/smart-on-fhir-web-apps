import {ResearchParticipantComponent} from './research-participant.component';
import {ResearchCase, ResearchInteraction} from './researcher-api.service';
import {TestBed} from '@angular/core/testing';
import {ActivatedRoute, provideRouter} from '@angular/router';
import {of} from 'rxjs';
import {ResearcherApiService} from './researcher-api.service';
import {ResearcherAuthService} from './researcher-auth.service';

describe('ResearchParticipantComponent interaction grouping', () => {
  const caseItem = {
    caseId: 'B1', block: 'B', primaryStudyDisease: 'Coronary Heart Disease', presentationPosition: 1
  } as ResearchCase;

  const interaction = (id: number, disease: string, source: string): ResearchInteraction => ({
    interactionId: id, sequenceNumber: id, caseId: 'B1', block: 'B', chartType: 'waterfall',
    disease, primaryStudyDisease: 'Coronary Heart Disease', interactionDisease: disease,
    questionSource: source, questionText: `Question ${id}`, answerText: `Answer ${id}`,
    suggestedQuestionId: null, llmSessionId: null, requestId: null, clientTimestamp: null,
    createdAt: '2026-10-02T00:00:00Z', review: null
  });

  it('keeps primary, other, and unknown interaction diseases separate', () => {
    const component = new ResearchParticipantComponent({} as any, {} as any, {} as any, {} as any);
    const participant = {
      cases: [caseItem],
      interactions: [
        interaction(1, 'Coronary Heart Disease', 'suggested'),
        interaction(2, 'Depression', 'free_text'),
        interaction(3, 'Depression', 'suggested'),
        interaction(4, 'COPD', 'free_text'),
        interaction(5, 'Not recorded', 'free_text')
      ]
    } as any;
    component['setParticipant'](participant);

    const groups = component.interactionGroupsByCaseId['B1'];
    expect(groups.primaryInteractions.map(item => item.interactionId)).toEqual([1]);
    expect(groups.otherDiseaseGroups.map(group => [group.disease, group.interactions.length]))
      .toEqual([['Depression', 2], ['COPD', 1]]);
    expect(groups.totalOtherDiseaseInteractions).toBe(3);
    expect(groups.unknownDiseaseInteractions.map(item => item.interactionId)).toEqual([5]);
    expect(groups.otherDiseaseGroups[0].freeTextInteractions.map(item => item.interactionId)).toEqual([2]);
    expect(groups.otherDiseaseGroups[0].suggestedInteractions.map(item => item.interactionId)).toEqual([3]);
  });

  it('keeps P3 identity stable and marks it not applicable outside the first block position', () => {
    const component = new ResearchParticipantComponent({} as any, {} as any, {} as any, {} as any);
    const nonFirstCase = {...caseItem, presentationPosition: 2, p3Applicable: false} as ResearchCase;

    expect(component.assessmentLabels['p3']).toBe('Meaning of the baseline');
    expect(component.assessmentLabels['p4']).toBe('Predicted risk compared with baseline');
    expect(component.isNotApplicable(nonFirstCase, 'p3')).toBeTrue();
    expect(component.isNotApplicable(nonFirstCase, 'p4')).toBeFalse();
  });

  it('precomputes independent stable groups for multiple B cases', () => {
    const component = new ResearchParticipantComponent({} as any, {} as any, {} as any, {} as any);
    const secondCase = {...caseItem, caseId: 'B2', presentationPosition: 2} as ResearchCase;
    const secondCaseInteraction = {...interaction(6, 'Depression', 'free_text'), caseId: 'B2'};
    component['setParticipant']({
      cases: [secondCase, caseItem],
      interactions: [interaction(1, 'Coronary Heart Disease', 'suggested'), secondCaseInteraction]
    } as any);

    expect(component.casesByBlock.B.map(item => item.caseId)).toEqual(['B1', 'B2']);
    expect(component.interactionGroupsByCaseId['B1'].primaryInteractions[0].interactionId).toBe(1);
    expect(component.interactionGroupsByCaseId['B2'].otherDiseaseGroups[0].interactions[0].interactionId).toBe(6);
    expect(component.interactionGroupsByCaseId['B2'].otherDiseaseGroups)
      .toBe(component.interactionGroupsByCaseId['B2'].otherDiseaseGroups);
  });

  it('keeps initial explanations separate from interaction counts and groups them responsively', () => {
    const component = new ResearchParticipantComponent({} as any, {} as any, {} as any, {} as any);
    component['setParticipant']({
      cases: [caseItem],
      interactions: [interaction(1, 'Coronary Heart Disease', 'suggested')],
      initialExplanations: [{
        caseId: 'B1', block: 'B', disease: 'Coronary Heart Disease', chartType: 'waterfall',
        primaryStudyDisease: 'Coronary Heart Disease', interactionDisease: 'Coronary Heart Disease',
        llmSessionId: 'session-1', explanation: {plotOverview: 'Overview'},
        createdAt: '2026-10-02T00:00:00Z', schemaVersion: 1
      }]
    } as any);

    expect(component.initialExplanationsByCaseId['B1'].length).toBe(1);
    expect(component.interactionGroupsByCaseId['B1'].primarySuggestedInteractions.length).toBe(1);
    expect(component.interactionGroupsByCaseId['B1'].primaryFreeTextInteractions.length).toBe(0);
  });

  it('allows post-hoc review only for primary-disease free-text questions', () => {
    const component = new ResearchParticipantComponent({} as any, {} as any, {} as any, {} as any);

    expect(component.canReview(interaction(1, 'Coronary Heart Disease', 'free_text'))).toBeTrue();
    expect(component.canReview(interaction(2, 'Coronary Heart Disease', 'suggested'))).toBeFalse();
    expect(component.canReview(interaction(3, 'Depression', 'free_text'))).toBeFalse();
    expect(component.canReview(interaction(4, 'Depression', 'suggested'))).toBeFalse();
  });

  it('renders initial explanation fields in responsive dashboard columns', async () => {
    const participant = {
      participantId: 'P001', currentStage: 'B', currentCaseId: 'B1',
      assignmentGroup: 'XY', assignedCaseOrder: {A: ['A1', 'A2', 'A3', 'A4'], B: ['B1', 'B2', 'B3', 'B4']},
      completedCaseIds: [], postACompleted: false, postBCompleted: false,
      comparisonCompleted: false, interviewCompleted: false, backgroundCompleted: false,
      startedAt: null, completedAt: null, totalCompletedCases: 0,
      cases: [{...caseItem, status: 'in_progress', phase: 'inspection',
        inspectionDurationMs: 0, evaluationDurationMs: 0, assessmentAnswers: {},
        assessmentScoring: [], startedAt: null, completedAt: null}],
      interactions: [], background: null, postA: null, postB: null,
      comparison: null, interview: null,
      initialExplanations: [{
        caseId: 'B1', block: 'B', disease: 'Coronary Heart Disease', chartType: 'waterfall',
        primaryStudyDisease: 'Coronary Heart Disease', interactionDisease: 'Coronary Heart Disease',
        llmSessionId: 'session-1', explanation: {
          plotOverview: 'A long overview', plotSummary: 'A long summary'
        }, createdAt: '2026-10-02T00:00:00Z', schemaVersion: 1
      }]
    } as any;
    await TestBed.configureTestingModule({
      imports: [ResearchParticipantComponent],
      providers: [
        provideRouter([]),
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'P001'}}}},
        {provide: ResearcherApiService, useValue: {getParticipant: () => of(participant)}},
        {provide: ResearcherAuthService, useValue: {logout: () => undefined}}
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(ResearchParticipantComponent);
    fixture.detectChanges();
    const explanation = fixture.nativeElement.querySelector('[aria-label="Initial explanations"]');
    expect(explanation.textContent).toContain('A long overview');
    expect(explanation.querySelector('.col-12.col-md-6')).not.toBeNull();
    expect(explanation.querySelector('.text-break')).not.toBeNull();
  });
});
