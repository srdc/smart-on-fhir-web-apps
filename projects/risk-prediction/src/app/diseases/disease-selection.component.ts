import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CdsHooksService} from 'cds-hooks';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {SAVED_RESPONSE_KEY} from '../form/form.component';

interface SelectableDisease {
  id: string;        // sent to risk_prediction (ML service disease name)
  name: string;
  group?: string;
  selected: boolean;
}

/**
 * Step between the saved questionnaire and the results: the user selects the diseases to calculate the risk
 * for. The list comes from the risk_prediction_diseases CDS service; the selection is sent to risk_prediction
 * (context 'diseases'), which asks the ML service for these diseases only.
 */
@Component({
  selector: 'rp-disease-selection',
  templateUrl: './disease-selection.component.html'
})
export class DiseaseSelectionComponent implements OnInit {
  /** localStorage key of the last selection (pre-selected next time) */
  private static readonly SELECTION_KEY = 'risk_prediction_selected_diseases';

  patient?: fhir4.Patient;
  questionnaireResponse?: fhir4.QuestionnaireResponse;
  diseases: SelectableDisease[] = [];
  groups: { name: string, diseases: SelectableDisease[] }[] = [];
  loading = true;
  calculating = false;
  error: string | undefined;

  constructor(private cds: CdsHooksService<any>, private sof: SmartOnFhirService, private router: Router) {}

  get selectedCount(): number {
    return this.diseases.filter(d => d.selected).length;
  }

  async ngOnInit(): Promise<void> {
    try {
      this.patient = await this.sof.getPatient();
      this.questionnaireResponse = await this.findSavedResponse();
      if (!this.questionnaireResponse) {
        this.error = 'No saved questionnaire response was found for this patient. Please complete and save the questionnaire first.';
        return;
      }
      const client = await this.sof.getClient();
      const response = await this.cds.callService({
        serviceId: 'risk_prediction_diseases',
        language: 'en',
        // The CDS services read the patient's data with the app's FHIR access token
        fhirServer: client?.state?.serverUrl,
        fhirAuthorization: client?.state?.tokenResponse,
        context: {patientId: this.patient?.id},
        prefetch: {patient: this.patient}
      });
      const detail = response?.cards?.[0]?.detail;
      const available: { id: string, name: string, group?: string }[] = detail ? JSON.parse(this.decode(detail)).diseases ?? [] : [];
      if (!available.length) {
        this.error = 'The list of diseases could not be retrieved from the risk prediction service.';
        return;
      }
      const previous = this.loadSelection();
      this.diseases = available.map(d => ({...d, selected: previous ? previous.includes(d.id) : true}));
      for (const d of this.diseases) {
        const name = d.group || 'Other';
        let group = this.groups.find(g => g.name === name);
        if (!group) {
          group = {name, diseases: []};
          this.groups.push(group);
        }
        group.diseases.push(d);
      }
    } catch (e) {
      console.error('Error loading the disease list:', e);
      this.error = 'The list of diseases could not be retrieved from the risk prediction service.';
    } finally {
      this.loading = false;
    }
  }

  setAll(selected: boolean): void {
    this.diseases.forEach(d => d.selected = selected);
  }

  setGroup(group: { diseases: SelectableDisease[] }, selected: boolean): void {
    group.diseases.forEach(d => d.selected = selected);
  }

  async calculate(): Promise<void> {
    const selected = this.diseases.filter(d => d.selected).map(d => d.id);
    if (!selected.length || !this.questionnaireResponse) return;
    try {
      localStorage.setItem(DiseaseSelectionComponent.SELECTION_KEY, JSON.stringify(selected));
    } catch (e) {
      // ignore (storage not available)
    }
    this.calculating = true;
    this.error = undefined;
    try {
      const client = await this.sof.getClient();
      const response = await this.cds.callService({
        serviceId: 'risk_prediction',
        language: 'en',
        // The CDS services read the patient's data with the app's FHIR access token
        fhirServer: client?.state?.serverUrl,
        fhirAuthorization: client?.state?.tokenResponse,
        context: {patientId: this.patient?.id, qrId: this.questionnaireResponse.id, diseases: selected},
        prefetch: {
          patient: this.patient,
          qr: this.questionnaireResponse,
          observations: {resourceType: 'Bundle', entry: []}
        }
      });
      localStorage.setItem('questionnaire_results', JSON.stringify(response?.cards ?? []));
      this.router.navigate(['/results']);
    } catch (e) {
      console.error('Error calculating the risks:', e);
      this.error = 'The risks could not be calculated. Please try again.';
    } finally {
      this.calculating = false;
    }
  }

  backToQuestionnaire(): void {
    this.router.navigate(['/form']);
  }

  /** The response saved on the questionnaire page, or the patient's latest saved one */
  private async findSavedResponse(): Promise<fhir4.QuestionnaireResponse | undefined> {
    const reference = `Patient/${this.patient?.id}`;
    try {
      const stored = sessionStorage.getItem(SAVED_RESPONSE_KEY);
      const qr = stored ? JSON.parse(stored) as fhir4.QuestionnaireResponse : undefined;
      if (qr?.subject?.reference === reference) return qr;
    } catch (e) {
      // ignore and search below
    }
    if (!this.patient?.id) return undefined;
    const bundle = await this.sof.search<fhir4.QuestionnaireResponse>('QuestionnaireResponse', {
      patient: reference,
      questionnaire: 'Questionnaire/stage_wp6_features',
      _sort: '-authored',
      _count: 20
    });
    return (bundle?.entry ?? [])
      .map((e: any) => e.resource as fhir4.QuestionnaireResponse)
      .filter((r: fhir4.QuestionnaireResponse) => r?.resourceType === 'QuestionnaireResponse' && !!r.authored)
      .sort((a: fhir4.QuestionnaireResponse, b: fhir4.QuestionnaireResponse) => Date.parse(b.authored!) - Date.parse(a.authored!))[0];
  }

  private loadSelection(): string[] | undefined {
    try {
      const saved = localStorage.getItem(DiseaseSelectionComponent.SELECTION_KEY);
      return saved ? JSON.parse(saved) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  /** The card detail is HTML-escaped JSON (mustache template) */
  private decode(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
}
