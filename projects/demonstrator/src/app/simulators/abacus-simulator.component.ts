import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {DEMO_TAG} from '../demo-patient.service';

interface CompletedQuestionnaire {
  questionnaire?: fhir4.Questionnaire;
  response: fhir4.QuestionnaireResponse;
  /** answers being edited: linkId -> answer code */
  draft?: Record<string, string>;
}

/**
 * Simulation of the Health Monitoring App (ABACUS): the questionnaires the patient completed, as stored in the STAGE FHIR
 * repository, and answering them again as the patient (a new QuestionnaireResponse, like the app stores it).
 */
@Component({
  selector: 'demo-abacus-simulator',
  templateUrl: './abacus-simulator.component.html'
})
export class AbacusSimulatorComponent implements OnInit {
  @Input({required: true}) patientId!: string;
  @Input() patientName = '';
  @Output() saved = new EventEmitter<fhir4.QuestionnaireResponse>();

  loading = true;
  error?: string;
  completed: CompletedQuestionnaire[] = [];
  open?: CompletedQuestionnaire;
  saving = false;
  message?: string;

  constructor(private sof: SmartOnFhirService) {}

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading = true;
    this.error = undefined;
    try {
      const bundle = await this.sof.search<fhir4.QuestionnaireResponse>('QuestionnaireResponse', {
        subject: 'Patient/' + this.patientId, _sort: '-authored', _count: 200
      });
      // the latest response of each patient questionnaire (not the risk questionnaire of the clinician tools)
      const latest = new Map<string, fhir4.QuestionnaireResponse>();
      (bundle.entry || []).map(e => e.resource!).filter(r => r?.resourceType === 'QuestionnaireResponse')
        .filter(r => r.questionnaire && !r.questionnaire.includes('stage_wp6_features'))
        .sort((a, b) => (b.authored || '').localeCompare(a.authored || ''))
        .forEach(r => latest.has(r.questionnaire!) || latest.set(r.questionnaire!, r));
      const client = await this.sof.getClient();
      this.completed = await Promise.all([...latest.values()].map(async response => ({
        response,
        questionnaire: await client!.request<fhir4.Questionnaire>(response.questionnaire!).catch(() => undefined)
      })));
      this.completed.sort((a, b) => this.title(a).localeCompare(this.title(b)));
    } catch (err: any) {
      this.error = 'The questionnaires could not be loaded: ' + (err?.message || err);
    }
    this.loading = false;
  }

  title(q: CompletedQuestionnaire): string {
    return q.questionnaire?.title || q.response.identifier?.value || q.response.questionnaire || 'Questionnaire';
  }

  items(q: CompletedQuestionnaire): fhir4.QuestionnaireItem[] {
    return q.questionnaire?.item?.filter(i => i.type === 'choice') || [];
  }

  answerCode(q: CompletedQuestionnaire, linkId: string): string | undefined {
    return q.response.item?.find(i => i.linkId === linkId)?.answer?.[0]?.valueCoding?.code;
  }

  answerDisplay(q: CompletedQuestionnaire, item: fhir4.QuestionnaireItem): string {
    const code = this.answerCode(q, item.linkId);
    return item.answerOption?.find(o => o.valueCoding?.code === code)?.valueCoding?.display || code || '–';
  }

  edit(q: CompletedQuestionnaire) {
    this.message = undefined;
    q.draft = Object.fromEntries(this.items(q).map(item => [item.linkId, this.answerCode(q, item.linkId) || '']));
  }

  /** Store the answers as a new response of the questionnaire, as the Health Monitoring App does */
  async save(q: CompletedQuestionnaire) {
    this.saving = true;
    this.message = undefined;
    try {
      const response: fhir4.QuestionnaireResponse = {
        resourceType: 'QuestionnaireResponse',
        meta: {tag: [DEMO_TAG]},
        status: 'completed',
        subject: {reference: 'Patient/' + this.patientId},
        authored: new Date().toISOString(),
        identifier: q.response.identifier,
        questionnaire: q.response.questionnaire,
        item: this.items(q).filter(item => q.draft![item.linkId])
          .map(item => ({linkId: item.linkId, answer: [{valueCoding: {code: q.draft![item.linkId]}}]}))
      };
      const created = await this.sof.create(response);
      q.response = created;
      q.draft = undefined;
      this.message = `Saved. ${this.title(q)} now has the new answers.`;
      this.saved.emit(created);
    } catch (err: any) {
      this.message = 'The answers could not be saved: ' + (err?.message || err);
    }
    this.saving = false;
  }
}
