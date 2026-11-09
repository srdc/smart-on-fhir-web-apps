import {Component, OnDestroy, OnInit} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CdsHooksService } from 'cds-hooks';
import { SmartOnFhirService } from "ng-smart-on-fhir";
import {MenuService} from "../menu.service";
import {environment} from "../../environments/environment";

/** sessionStorage key of the response saved last; the disease selection page sends it to risk_prediction */
export const SAVED_RESPONSE_KEY = 'risk_prediction_qr';

@Component({
  selector: 'risk-prediction-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss']
})
export class FormComponent implements OnInit, OnDestroy {

  questionnaire: fhir4.Questionnaire|undefined;
  groups: fhir4.QuestionnaireItem[] = [];
  selectedGroup: any = null;

  patient?: fhir4.Patient;

  answers: { [linkId: string]: any } = {};
  prefilledAnswers: { [linkId: string]: boolean } = {};
  saving: boolean = false;
  loading: boolean = true;
  /** EHR feature extraction (risk_prediction_form) running - takes 20-30 s */
  prefillLoading: boolean = false;
  prefillError: string | undefined;
  /** The shown answers come from this saved response (instead of a new EHR extraction) */
  savedResponse: fhir4.QuestionnaireResponse | undefined;
  readonly savedResponseMaxAgeDays: number = environment.riskPrediction?.savedResponseMaxAgeDays ?? 7;

  constructor(
    private http: HttpClient,
    private cdsHooksService: CdsHooksService<any>,
    private router: Router,
    private sof: SmartOnFhirService,
    private menuService: MenuService
  ) {}

  ngOnDestroy() {
    this.menuService.menuItems = []
  }

  async ngOnInit() {
    this.loading = true;

    try {
      this.patient = await this.sof.getPatient();

      // Load questionnaire
      await this.loadQuestionnaire();
      setTimeout(() => {
        this.menuService.menuItems.splice(0, this.menuService.menuItems.length, ...this.groups.map(group => ({
          label: group.text || group.linkId,
          callback: () => {
            const accordionBtn = document.getElementById('accordion-btn-' + group.linkId)
            accordionBtn?.scrollIntoView({ behavior: 'smooth' });
            if (accordionBtn?.classList.contains('collapsed')) {
              accordionBtn?.click()
            }
          }
        })))
      })

      // Show the last saved response when it is recent enough; otherwise collect the data from the EHR
      // (feature extraction via the risk_prediction_form CDS service)
      const saved = await this.findLatestSavedResponse();
      if (saved && this.isRecent(saved)) {
        this.applySavedResponse(saved);
      } else {
        await this.loadPrefilledAnswersFromCDS();

        // If no pre-filled data, restore the draft from localStorage
        if (Object.keys(this.answers).length === 0) {
          this.loadAnswersFromLocalStorage();
        }
      }
    } catch (error) {
      console.error('Error in ngOnInit:', error);
    } finally {
      this.loading = false;
    }
  }

  private async loadQuestionnaire(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.http.get('http://localhost:8085/onfhir-feast/api/definition/FeatureSet/stage_wp6_features/$as-questionnaire?outcome=false')
        .subscribe({
        next: (q: any) => {
          this.questionnaire = <fhir4.Questionnaire>q;
          this.groups = q.item;
          this.selectedGroup = this.groups[0];
          resolve();
        },
        error: (err) => {
          console.error('Error loading questionnaire:', err);
          reject(err);
        }
      });
    });
  }

  /**
   * Load pre-filled answers from CDS service
   */
  private async loadPrefilledAnswersFromCDS(): Promise<boolean> {
    if (!this.patient?.id) {
      console.log('No patient ID, skipping pre-fill');
      return false;
    }

    this.prefillLoading = true;
    this.prefillError = undefined;
    try {
      console.log('Patient ID:', this.patient.id);
      const client = await this.sof.getClient()
      // Call CDS service to get pre-filled QR
      const response = await this.cdsHooksService.callService({
        serviceId: "risk_prediction_form",
        language: "en",
        fhirServer: client?.state?.serverUrl,
        fhirAuthorization: client?.state.tokenResponse,
        context: {
          patientId: this.patient.id
        },
        prefetch: {
          patient: this.patient,
          // questionnaire: <fhir4.Bundle>{
          //   resourceType: 'Bundle',
          //   entry: [{ resource: this.questionnaire, search: { mode: 'match' } }]
          // }
        }
      });

      console.log('CDS Response:', response);

      // Extract prefilled qr from card
      if (response?.cards && response.cards.length > 0) {
        const card = response.cards[0];

        console.log('Card summary:', card.summary);

        // Extract QR from suggestion action
        const questionnaireResponse = card.suggestions?.[0]?.actions?.[0]?.resource;

        if (questionnaireResponse) {
          console.log('Pre-filled QuestionnaireResponse:', questionnaireResponse);

          // Extract answers from QR
          if (questionnaireResponse.item) {
            this.extractAnswersFromResponse(questionnaireResponse.item);
            console.log(`Extracted ${Object.keys(this.answers).length} pre-filled answers`);
          }
        } else {
          console.log('No QuestionnaireResponse in card');
        }
      } else {
        console.log('No cards in CDS response');
      }

      return true;
    } catch (error) {
      console.error('Error loading pre-filled answers from CDS:', error);
      this.prefillError = 'The patient\'s data could not be collected from the EHR. Please try again or fill in the questionnaire manually.';
      return false;
    } finally {
      this.prefillLoading = false;
    }
  }

  /**
   * Latest QuestionnaireResponse saved for this patient against the risk questionnaire (or undefined)
   */
  private async findLatestSavedResponse(): Promise<fhir4.QuestionnaireResponse | undefined> {
    if (!this.patient?.id || !this.questionnaire?.id) return undefined;
    try {
      const bundle = await this.sof.search<fhir4.QuestionnaireResponse>('QuestionnaireResponse', {
        subject: `Patient/${this.patient.id}`,
        questionnaire: `Questionnaire/${this.questionnaire.id}`,
        _sort: '-authored',
        _count: 20
      });
      const responses = (bundle?.entry ?? [])
        .map((e: any) => e.resource as fhir4.QuestionnaireResponse)
        .filter((r: fhir4.QuestionnaireResponse) => r?.resourceType === 'QuestionnaireResponse' && !!r.authored);
      // newest first (also when the server ignores _sort)
      responses.sort((a: fhir4.QuestionnaireResponse, b: fhir4.QuestionnaireResponse) => Date.parse(b.authored!) - Date.parse(a.authored!));
      return responses[0];
    } catch (e) {
      console.error('Error searching the saved questionnaire responses:', e);
      return undefined;
    }
  }

  /** Whether the saved response is recent enough to be shown instead of a new EHR extraction */
  private isRecent(qr: fhir4.QuestionnaireResponse): boolean {
    const authored = qr.authored ? Date.parse(qr.authored) : NaN;
    return !Number.isNaN(authored) && Date.now() - authored <= this.savedResponseMaxAgeDays * 24 * 60 * 60 * 1000;
  }

  /** Show the answers of a saved response */
  private applySavedResponse(qr: fhir4.QuestionnaireResponse): void {
    this.answers = {};
    this.prefilledAnswers = {};
    this.extractAnswersFromResponse(qr.item ?? [], false);
    this.savedResponse = qr;
    sessionStorage.setItem(SAVED_RESPONSE_KEY, JSON.stringify(qr));
    console.log(`Showing the response saved on ${qr.authored} (${Object.keys(this.answers).length} answers)`);
  }

  /**
   * Collect the data from the EHR again (feature extraction). Answers to questions the EHR has no data for
   * (e.g. the ones only asked on the form) are kept.
   */
  async refreshFromEhr(): Promise<void> {
    const previousAnswers = this.answers;
    this.answers = {};
    this.prefilledAnswers = {};
    const ok = await this.loadPrefilledAnswersFromCDS();
    for (const [linkId, value] of Object.entries(previousAnswers)) {
      if (!(linkId in this.answers)) {
        this.answers[linkId] = value;
      }
    }
    if (ok) {
      this.savedResponse = undefined;
      this.saveAnswers();
    }
  }

  /**
   * Extract answers from QuestionnaireResponse items
   */
  private extractAnswersFromResponse(items: any[], markPrefilled: boolean = true): void {
    items.forEach(item => {
      const itemAnswers: any[] = item.answer ?? [];
      if (itemAnswers.length > 0) {
        let value: any;
        if (itemAnswers[0].valueCoding) {
          // Coded answers: keep the codes (an array for repeating questions)
          const codes = itemAnswers.filter((a: any) => a.valueCoding).map((a: any) => a.valueCoding.code);
          value = (codes.length > 1 || this.findItem(item.linkId)?.repeats) ? codes : codes[0];
        } else {
          // valueDecimal / valueInteger / valueBoolean / valueString / valueDate ... (false and 0 are answers too)
          const key = Object.keys(itemAnswers[0]).find(k => k.startsWith('value'));
          value = key !== undefined ? itemAnswers[0][key] : undefined;
        }
        if (value !== undefined && value !== null) {
          this.answers[item.linkId] = value;
          this.prefilledAnswers[item.linkId] = markPrefilled;
          console.log(`  ✓ ${item.linkId} = ${JSON.stringify(value)}`);
        }
      }

      // Recursively process nested items
      if (item.item && item.item.length > 0) {
        this.extractAnswersFromResponse(item.item, markPrefilled);
      }
    });
  }

  /** Questionnaire item (question) with the given linkId */
  private findItem(linkId: string, items: any[] = this.questionnaire?.item ?? []): any {
    for (const it of items) {
      if (it.linkId === linkId) return it;
      const found = it.item ? this.findItem(linkId, it.item) : undefined;
      if (found) return found;
    }
    return undefined;
  }

  /** Whether a form value counts as an answer for the given question */
  private hasAnswer(q: any, value: any): boolean {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (q.type === 'decimal' || q.type === 'integer') return !Number.isNaN(Number(value));
    return true;
  }

  /**
   * FHIR answers for a question, typed by the question's type (the generated Questionnaire declares it;
   * hop 2 reads the saved answers with the same types: valueCoding.code, valueDecimal, valueBoolean, ...)
   */
  private toAnswers(q: any, value: any): any[] {
    const values = Array.isArray(value) ? value : [value];
    switch (q.type) {
      case 'choice':
      case 'open-choice':
        return values.map((code: any) => {
          const opt = (q.answerOption ?? []).find((o: any) => String(o.valueCoding?.code) === String(code));
          return { valueCoding: opt?.valueCoding ? { ...opt.valueCoding } : { code: String(code) } };
        });
      case 'boolean':
        return [{ valueBoolean: value === true || value === 'true' }];
      case 'integer':
        return [{ valueInteger: Math.round(Number(value)) }];
      case 'decimal':
        return [{ valueDecimal: Number(value) }];
      case 'date':
        return [{ valueDate: String(value) }];
      case 'dateTime':
        return [{ valueDateTime: String(value) }];
      default:
        return [{ valueString: String(value) }];
    }
  }

  isPrefilled(linkId: string): boolean {
    return this.prefilledAnswers[linkId] === true;
  }

  private loadAnswersFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem(this.draftStorageKey());
      if (saved) {
        this.answers = JSON.parse(saved);
        console.log('Restored answers from localStorage:', this.answers);
      }
    } catch (e) {
      console.error('Error loading answers from localStorage:', e);
    }
  }

  private saveAnswers(): void {
    try {
      localStorage.setItem(this.draftStorageKey(), JSON.stringify(this.answers));
    } catch (e) {
      console.error('Error saving answers:', e);
    }
  }

  /** Draft answers are kept per patient */
  private draftStorageKey(): string {
    return `questionnaire_answers_${this.patient?.id ?? 'unknown'}`;
  }

  selectGroup(group: any): void {
    this.selectedGroup = group;
  }

  onAnswerChanged(ev: { linkId: string; value: any }): void {
    this.updateAnswer(ev.linkId, ev.value);

    // Mark as no longer pre-filled since user modified it
    if (this.prefilledAnswers[ev.linkId]) {
      this.prefilledAnswers[ev.linkId] = false;
    }
  }

  updateAnswer(linkId: string, value: any): void {
    this.answers = {
      ...this.answers,
      [linkId]: value
    };
    this.saveAnswers();
  }

  private calculateAge(birthDate?: string): number | null {
    if (!birthDate) return null;

    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();

    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  generateResponse(): fhir4.QuestionnaireResponse|null {
    const age = this.calculateAge(this.patient?.birthDate);
    if (!this.patient?.id) return null;

    const groupItems = (this.questionnaire?.item ?? [])
      .map((group: any) => ({
        linkId: group.linkId,
        item: (group.item ?? [])
          .filter((q: any) => this.hasAnswer(q, this.answers[q.linkId]))
          .map((q: any) => ({
            linkId: q.linkId,
            answer: this.toAnswers(q, this.answers[q.linkId])
          }))
      }))
      .filter((g: any) => g.item && g.item.length > 0);

    const ageItem = age !== null
      ? {
        linkId: "21022",
        text: "Age",
        answer: [{ valueInteger: age }]
      }
      : null;

    return {
      resourceType: "QuestionnaireResponse",
      questionnaire: `Questionnaire/${this.questionnaire?.id}`,
      id: "risk-assessment-" + Date.now(),
      status: "completed",
      subject: { reference: `Patient/${this.patient.id}` },
      authored: new Date().toISOString(),
      item: [
        ...groupItems,
        ...(ageItem ? [ageItem] : [])
      ]
    };
  }

  async save() {
    this.saving = true;

    try {
      const qr = this.generateResponse();
      if (!qr) {
        alert("No patient/questionnaire context. Please launch with a patient.");
        return;
      }

      await this.sof.create<fhir4.QuestionnaireResponse>(qr, qr.id);
      this.savedResponse = qr;
      // The risks are calculated on the next page, for the diseases the user selects there
      sessionStorage.setItem(SAVED_RESPONSE_KEY, JSON.stringify(qr));
      this.router.navigate(['/diseases']);

    } catch (error) {
      console.error('Error in save:', error);
      alert('Error saving the questionnaire. Check console for details.');
    } finally {
      this.saving = false;
    }
  }

  clearForm(): void {
    if (confirm('Are you sure you want to clear all answers?')) {
      this.answers = {};
      this.prefilledAnswers = {};
      localStorage.removeItem(this.draftStorageKey());
    }
  }

  getPrefilledCountInGroup(group: any): number {
    if (!group.item) return 0;
    return group.item.filter((q: any) => this.isPrefilled(q.linkId)).length;
  }
}



