import {of} from 'rxjs';
import {StudyConversationService, StudyConversationState} from './study-conversation.service';

describe('StudyConversationService conversation isolation', () => {
  const state = (participantId: string, caseId: string, disease: string): StudyConversationState => ({
    participantId, caseId, disease, block: 'B', chartType: 'waterfall',
    llmSessionId: `${participantId}-${caseId}-${disease}`, initialExplanations: {},
    messages: [], suggestedQuestions: [], schemaVersion: 1
  });

  it('loads authoritative history with participant, case, disease, and chart identity', () => {
    const auth = {participantId: 'P002'};
    const http = jasmine.createSpyObj('HttpClient', ['get', 'put', 'post']);
    http.get.and.returnValue(of(state('P002', 'B1', 'Heart Failure')));
    const service = new StudyConversationService(http, auth as any);

    service.get('B1', 'Heart Failure', 'waterfall').subscribe();

    expect(http.get.calls.mostRecent().args[0]).toContain(
      '/participants/P002/cases/B1/conversation/waterfall?disease=Heart%20Failure'
    );
  });

  it('does not reuse cached history across cases, diseases, or participants', () => {
    const auth = {participantId: 'P002'};
    const http = jasmine.createSpyObj('HttpClient', ['get', 'put', 'post']);
    http.get.and.callFake((url: string) => of(state(
      url.includes('/P003/') ? 'P003' : 'P002',
      url.includes('/B2/') ? 'B2' : 'B1',
      url.includes('Depression') ? 'Depression' : 'Heart Failure'
    )));
    const service = new StudyConversationService(http, auth as any);

    service.get('B1', 'Heart Failure', 'waterfall').subscribe();
    service.get('B2', 'Heart Failure', 'waterfall').subscribe();
    service.get('B1', 'Depression', 'waterfall').subscribe();
    auth.participantId = 'P003';
    service.get('B1', 'Heart Failure', 'waterfall').subscribe();

    expect(http.get).toHaveBeenCalledTimes(4);
  });
});
