import {of} from 'rxjs';
import {ChatbotComponent} from './chatbot.component';
import {StudyConversationState} from '../study/services/study-conversation.service';

describe('ChatbotComponent Study conversation resume', () => {
  const savedState = (): StudyConversationState => ({
    participantId: 'P002', caseId: 'B1', disease: 'Heart Failure', block: 'B',
    chartType: 'waterfall', llmSessionId: 'persisted-session',
    initialExplanations: {waterfall: {plotOverview: 'Overview'}},
    messages: [
      {role: 'user', kind: 'user_free_text', text: 'Q1', requestId: 'r1'},
      {role: 'assistant', kind: 'assistant_answer', text: 'A1', requestId: 'r1'}
    ],
    suggestedQuestions: ['Q2'], schemaVersion: 1
  });

  function createComponent() {
    const cds = jasmine.createSpyObj('CdsHooksService', ['callService']);
    const conversation = jasmine.createSpyObj('StudyConversationService', [
      'get', 'save', 'logInteraction', 'initializeFrozen', 'sendFrozenMessage',
      'initializeDynamic', 'sendDynamicMessage'
    ]);
    conversation.get.and.returnValue(of(savedState()));
    conversation.save.and.callFake((_caseId: string, state: StudyConversationState) => of(state));
    conversation.logInteraction.and.returnValue(of({}));
    conversation.initializeFrozen.and.returnValue(of({...savedState(), schemaVersion: 2}));
    conversation.initializeDynamic.and.returnValue(of({...savedState(), schemaVersion: 3}));
    conversation.sendFrozenMessage.and.callFake((_caseId: string, _disease: string, question: string) => of({
      ...savedState(), schemaVersion: 2,
      messages: [
        {role: 'user' as const, kind: 'user_free_text' as const, text: question, requestId: 'r2'},
        {role: 'assistant' as const, kind: 'assistant_answer' as const, text: 'Read the Waterfall graph.', requestId: 'r2'}
      ],
      suggestedQuestions: ['What does the Waterfall plot show?']
    }));
    conversation.sendDynamicMessage.and.callFake((_caseId: string, _disease: string, question: string) => of({
      ...savedState(), schemaVersion: 3,
      messages: [{role: 'user' as const, kind: 'user_free_text' as const, text: question, requestId: 'r2'}],
      suggestedQuestions: ['Dynamic question']
    }));
    const sanitizer = {sanitize: (_context: unknown, value: string) => value};
    const component = new ChatbotComponent(
      {} as any, {} as any, cds, sanitizer as any, conversation
    );
    component.patientProfile = {resourceType: 'Patient', id: 'patient-1'};
    component.studyConversationCaseId = 'B1';
    component.primaryStudyDisease = 'Heart Failure';
    component.studyCaseContentHash = 'a'.repeat(64);
    component.disease = 'Heart Failure';
    component.chart = 'waterfall';
    component.localPlotResponse = {results: [{disease: 'Heart Failure', plots: {waterfall: {plot_type: 'waterfall'}}}]} as any;
    return {component, cds, conversation};
  }

  it('hydrates the exact case/disease/chart history after reload or login', async () => {
    const {component, conversation} = createComponent();
    await component.ngOnInit();

    expect(conversation.get).toHaveBeenCalledOnceWith('B1', 'Heart Failure', 'waterfall');
    expect(component.sessionId).toBe('persisted-session');
    expect(component.history.map(item => item.text)).toEqual(['Q1', '<p>A1</p>\n']);
  });

  it('appends a new answer to hydrated history with unchanged study metadata', async () => {
    const {component, cds, conversation} = createComponent();
    await component.ngOnInit();
    cds.callService.and.resolveTo({cards: [{detail: 'A2', suggestions: []}]});

    component.ask('Q2');
    await Promise.resolve();
    await Promise.resolve();

    const saved = conversation.save.calls.mostRecent().args[1] as StudyConversationState;
    expect(saved.messages.map(message => message.text)).toEqual(['Q1', 'A1', 'Q2', 'A2']);
    expect(saved.disease).toBe('Heart Failure');
    expect(saved.caseId).toBe('B1');
    expect(conversation.logInteraction.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      primaryStudyDisease: 'Heart Failure', disease: 'Heart Failure', chartType: 'waterfall'
    }));
  });

  it('keeps non-primary follow-up history while requesting a fresh display explanation', () => {
    const {component} = createComponent();
    component.disease = 'Depression';
    const nonPrimaryState = {
      ...savedState(), disease: 'Depression', initialExplanations: {}
    };

    expect((component as any).hydrateConversation(nonPrimaryState)).toBeFalse();
    expect(component.sessionId).toBe('persisted-session');
    expect(component.history.map(item => item.text)).toEqual(['Q1', '<p>A1</p>\n']);
  });

  it('preserves Waterfall terminology outside study mode', () => {
    const {component} = createComponent();

    expect(component.formatDisplayText('Waterfall chart and waterfall plot')).toBe(
      'Waterfall chart and waterfall plot'
    );
  });

  it('formats all Waterfall variants for study display without duplicate chart labels', () => {
    const {component} = createComponent();
    component.studyMode = true;

    expect(component.formatDisplayText(
      'Waterfall chart, waterfall graph, Waterfall plot, and standalone Waterfall. Waterfall chart chart.'
    )).toBe(
      'Patient-Specific Feature Impact chart, Patient-Specific Feature Impact chart, ' +
      'Patient-Specific Feature Impact chart, and standalone Patient-Specific Feature Impact. ' +
      'Patient-Specific Feature Impact chart.'
    );
  });

  it('formats restored assistant messages but leaves clinician text and persisted data unchanged', async () => {
    const {component, conversation} = createComponent();
    component.studyMode = true;
    const state = savedState();
    state.initialExplanations['waterfall'] = {
      plotOverview: 'The Waterfall plot overview',
      plotSummary: 'Waterfall chart summary',
      increasingFactors: ['Waterfall graph factor'],
      decreasingFactors: ['Waterfall factor'],
      confidenceAndCaveats: ['Waterfall chart caveat']
    };
    state.messages = [
      {role: 'user', kind: 'user_free_text', text: 'Explain the Waterfall chart', requestId: 'r1'},
      {role: 'assistant', kind: 'assistant_answer', text: 'The **Waterfall chart** answer', requestId: 'r1'}
    ];
    conversation.initializeFrozen.and.returnValue(of({...state, schemaVersion: 2}));

    await component.ngOnInit();

    expect(component.history[0].text).toBe('Explain the Waterfall chart');
    expect(component.history[1].text).toContain('<strong>Patient-Specific Feature Impact chart</strong>');
    expect(component.plotOverview).toBe('The Waterfall plot overview');
    expect(component.formatDisplayText(component.plotOverview)).toBe(
      'The Patient-Specific Feature Impact chart overview'
    );
    expect(state.messages[1].text).toBe('The **Waterfall chart** answer');
  });

  it('uses the Study-only frozen route instead of SmartCDS for Block B messages', async () => {
    const {component, cds, conversation} = createComponent();
    component.studyMode = true;
    await component.ngOnInit();
    component.ask('What does the Waterfall chart show?', undefined, 'suggested');
    await Promise.resolve();
    await Promise.resolve();

    expect(cds.callService).not.toHaveBeenCalled();
    expect(conversation.sendFrozenMessage).toHaveBeenCalled();
    expect(component.history.at(-1)?.text).toContain('Patient-Specific Feature Impact chart');
    expect(component.possibleNextQuestions).toEqual(['What does the Waterfall plot show?']);
    expect(component.formatDisplayText(component.possibleNextQuestions[0])).toBe(
      'What does the Patient-Specific Feature Impact chart show?'
    );
  });

  it('uses the Study dynamic route for a non-target Block B disease', async () => {
    const {component, cds, conversation} = createComponent();
    component.studyMode = true;
    component.disease = 'Depression';
    component.localPlotResponse = {results: [{disease: 'Depression', plots: {waterfall: {plot_type: 'waterfall'}}}]} as any;
    await component.ngOnInit();

    expect(conversation.initializeDynamic).toHaveBeenCalled();
    expect(conversation.initializeFrozen).not.toHaveBeenCalled();
    component.ask('Why?', undefined, 'suggested');
    await Promise.resolve();

    expect(conversation.sendDynamicMessage).toHaveBeenCalled();
    expect(cds.callService).not.toHaveBeenCalled();
  });

  it('adds deterministic Observed and Estimated labels from the waterfall payload', () => {
    const {component} = createComponent();
    component.studyMode = true;
    component.localPlotResponse = {
      patient_id: 'patient-1', model_name: 'test', results: [{
        disease: 'Heart Failure', prediction: {risk_score: 0.2}, local_shap_table: [], plots: {
          waterfall: {
            task: 'explain_shap_plot', version: '1', plot_type: 'waterfall', audience: 'clinician', language: 'en',
            model_context: {model_name: 'test', prediction_target: 'risk', output_type: 'probability', output_unit: 'probability'},
            patient_context: {patient_id: 'patient-1', clinical_summary: ''},
            waterfall_data: {
              baseline_value: 0.1, final_prediction: 0.2,
              top_positive_contributors: [{
                feature_name: 'Basophil percentage 0.0', display_name: 'Basophil percentage',
                feature_value: '0.88', feature_unit: '%', is_imputed: false,
                imputed_value: null, model_value: 0.1, shap_value: 0.02
              }],
              top_negative_contributors: [{
                feature_name: 'Testosterone 0.0', display_name: 'Testosterone',
                feature_value: null, feature_unit: 'nmol/L', is_imputed: true,
                imputed_value: '1.23', model_value: 0.2, shap_value: -0.01
              }],
              other_features_contribution: 0.09, num_other_features: 1,
              num_features_used: 3, num_missing_features: 1, num_imputed_features: 1
            },
            quality_flags: {confidence_level: 'not_assessed', missingness_warning: true,
              correlated_features_warning: false, out_of_distribution_warning: false}
          }
        }
      }]
    };

    expect(component.formatFactorWithProvenance('Basophil percentage: 0.88%')).toBe(
      'Basophil percentage: 0.88% (Observed)'
    );
    expect(component.formatFactorWithProvenance('Testosterone: 1.23 nmol/L')).toBe(
      'Testosterone: 1.23 nmol/L (Estimated)'
    );
    component.studyMode = false;
    expect(component.formatFactorWithProvenance('Testosterone: 1.23 nmol/L')).toBe(
      'Testosterone: 1.23 nmol/L'
    );
  });

  it('suppresses only the explicit missingness warning paragraph', () => {
    const {component} = createComponent();
    component.studyMode = true;

    expect(component.isMissingnessWarning(
      'Missingness warning: Information was unavailable for 22 features, which may affect reliability.'
    )).toBeTrue();
    expect(component.isMissingnessWarning(
      'Estimated values were not directly available for this patient.'
    )).toBeFalse();
    component.studyMode = false;
    expect(component.isMissingnessWarning(
      'Missingness warning: Information was unavailable for 22 features.'
    )).toBeFalse();
  });
});
