import {Component, OnDestroy, OnInit} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CdsHooksService } from 'cds-hooks';
import { SmartOnFhirService } from "ng-smart-on-fhir";
import {MenuService} from "../menu.service";

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

      // Load pre-filled answers via CDS service
      await this.loadPrefilledAnswersFromCDS();

      // If no pre-filled data, restore from localStorage
      if (Object.keys(this.answers).length === 0) {
        this.loadAnswersFromLocalStorage();
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
  private async loadPrefilledAnswersFromCDS(): Promise<void> {
    if (!this.patient?.id) {
      console.log('No patient ID, skipping pre-fill');
      return;
    }

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

    } catch (error) {
      console.error('Error loading pre-filled answers from CDS:', error);
    }
  }

  /**
   * Extract answers from QuestionnaireResponse items
   */
  private extractAnswersFromResponse(items: any[]): void {
    items.forEach(item => {
      if (item.answer && item.answer.length > 0) {
        const answer = item.answer[0];

        // Handle different answer types
        if (answer.valueInteger !== undefined && answer.valueInteger !== null) {
          this.answers[item.linkId] = answer.valueInteger;
          this.prefilledAnswers[item.linkId] = true;
          console.log(`  ✓ ${item.linkId} = ${answer.valueInteger} (integer)`);
        } else if (answer.valueCoding) {
          this.answers[item.linkId] = answer.valueCoding.code;
          this.prefilledAnswers[item.linkId] = true;
          console.log(`  ✓ ${item.linkId} = ${answer.valueCoding.code} (coding)`);
        } else if (answer.valueDecimal !== undefined && answer.valueDecimal !== null) {
          this.answers[item.linkId] = answer.valueDecimal;
          this.prefilledAnswers[item.linkId] = true;
          console.log(`  ✓ ${item.linkId} = ${answer.valueDecimal} (decimal)`);
        }
      }

      // Recursively process nested items
      if (item.item && item.item.length > 0) {
        this.extractAnswersFromResponse(item.item);
      }
    });
  }

  isPrefilled(linkId: string): boolean {
    return this.prefilledAnswers[linkId] === true;
  }

  private loadAnswersFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('questionnaire_answers');
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
      localStorage.setItem('questionnaire_answers', JSON.stringify(this.answers));
    } catch (e) {
      console.error('Error saving answers:', e);
    }
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

  generateResponse() {
    const age = this.calculateAge(this.patient?.birthDate);
    if (!this.patient?.id) return null;

    const groupItems = (this.questionnaire?.item ?? [])
      .map((group: any) => ({
        linkId: group.linkId,
        item: (group.item ?? [])
          .filter((q: any) => this.answers[q.linkId] !== undefined)
          .map((q: any) => ({
            linkId: q.linkId,
            answer: [
              q.type === "choice"
                ? { valueCoding: { code: this.answers[q.linkId] } }
                : { valueDecimal: Number(this.answers[q.linkId]) }
            ]
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

      const patientId = this.patient?.id;
      const qrId = qr.id;

      // Call risk calculation service
      const response = await this.cdsHooksService.callService({
        serviceId: "risk_prediction",
        language: "en",
        context: { patientId, qrId },
        prefetch: { patient: this.patient, qr: qr, observations: { resourceType: 'Bundle', entry: [] } }
      });

      console.log('Risk Calculation Response:', response);

      localStorage.setItem('questionnaire_results', JSON.stringify(response?.cards ?? []));

      this.router.navigate(['/results']);

    } catch (error) {
      console.error('Error in save:', error);
      alert('Error processing questionnaire. Check console for details.');
    } finally {
      this.saving = false;
    }
  }

  clearForm(): void {
    if (confirm('Are you sure you want to clear all answers?')) {
      this.answers = {};
      this.prefilledAnswers = {};
      localStorage.removeItem('questionnaire_answers');
    }
  }

  getPrefilledCountInGroup(group: any): number {
    if (!group.item) return 0;
    return group.item.filter((q: any) => this.isPrefilled(q.linkId)).length;
  }
}



