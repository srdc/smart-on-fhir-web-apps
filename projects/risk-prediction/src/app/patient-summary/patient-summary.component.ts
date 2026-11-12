import { Component, OnDestroy, OnInit } from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import { SmartOnFhirService } from 'ng-smart-on-fhir';
import moment from 'moment';
import {firstValueFrom} from 'rxjs';
import {StudyCaseStimulusService} from '../study/services/study-case-stimulus.service';
import {PatientSummaryItem} from './patient-summary.models';
import {PatientSummaryShellService} from './patient-summary-shell.service';
import {StudyProgressService} from '../study/services/study-progress.service';

@Component({
  selector: 'rp-patient-summary',
  templateUrl: './patient-summary.component.html',
  styleUrls: ['./patient-summary.component.scss']
})
export class PatientSummaryComponent implements OnInit, OnDestroy {
  // Raw FHIR
  patient?: fhir4.Patient;

  // Panels
  conditionItems:  PatientSummaryItem[] = [];
  symptomItems:    PatientSummaryItem[] = [];
  medicationItems: PatientSummaryItem[] = [];
  familyItems:     PatientSummaryItem[] = [];
  labItems:        PatientSummaryItem[] = [];
  vitalItems:      PatientSummaryItem[] = [];
  lifestyleItems:  PatientSummaryItem[] = [];
  surveyItems:     PatientSummaryItem[] = [];
  historyEvents?: import('./history/history.types').HistoryEvent[];

  readonly isStudyCaseSummary: boolean;
  readonly continueRoute: string | any[];
  readonly studyCaseId: string | null;
  studyContinueError: string | null = null;
  studyContinuePending = false;

  // Paging states
  itemsPerPage = 10;

  conditionPage = 1;
  symptomPage   = 1;
  medicationPage= 1;
  familyPage    = 1;
  vitalPage     = 1;
  labPage       = 1;
  lifestylePage = 1;
  surveyPage    = 1;


  private static readonly DATE_FMT = 'DD/MM/YYYY';
  private questionnaires: { [ref: string]: fhir4.Questionnaire }|undefined;

  constructor(
    private sof: SmartOnFhirService,
    private route: ActivatedRoute,
    private router: Router,
    private studyCases: StudyCaseStimulusService,
    private summaryShell: PatientSummaryShellService,
    private studyProgress: StudyProgressService
  ) {
    this.isStudyCaseSummary = this.route.snapshot.data['studyCaseSummary'] === true;
    const caseId = this.route.snapshot.paramMap.get('caseId');
    this.studyCaseId = caseId;
    this.continueRoute = this.isStudyCaseSummary && caseId
      ? ['/study/cases', caseId, 'form']
      : '/form';
  }

  continueStudyCase(): void {
    if (!this.isStudyCaseSummary || !this.studyCaseId || this.studyContinuePending) return;
    this.studyContinuePending = true;
    this.studyContinueError = null;
    this.studyProgress.beginForm(this.studyCaseId).subscribe({
      next: () => void this.router.navigate(
        ['/study/cases', this.studyCaseId, 'form'],
        {replaceUrl: true}
      ),
      error: error => {
        this.studyContinuePending = false;
        this.studyContinueError = this.studyProgress.participantFacingError(error, 'Case setup transition');
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      if (this.isStudyCaseSummary) {
        const caseId = this.route.snapshot.paramMap.get('caseId');
        if (!caseId) throw new Error('Study case summary route is missing caseId.');
        const stimulus = await firstValueFrom(this.studyCases.getCase(caseId));
        this.patient = stimulus.case.patientProfile;
        const snapshot = stimulus.case.patientSummary;
        this.conditionItems = this.presentFrozenItems(snapshot.conditionItems);
        this.symptomItems = this.presentFrozenItems(snapshot.symptomItems);
        this.medicationItems = this.presentFrozenItems(snapshot.medicationItems);
        this.familyItems = this.presentFrozenItems(snapshot.familyItems);
        this.labItems = this.presentFrozenItems(snapshot.labItems);
        this.vitalItems = this.presentFrozenItems(snapshot.vitalItems);
        this.lifestyleItems = this.presentFrozenItems(snapshot.lifestyleItems);
        this.surveyItems = this.presentFrozenItems(snapshot.surveyItems);
        this.historyEvents = snapshot.historyEvents;
        const frozenAge = Number(stimulus.case.questionnaireAnswers['21003']);
        this.summaryShell.setStudyPatient(this.patient, frozenAge);
        return;
      }

      // 1) Patient
      this.patient = await this.sof.getPatient();
      const subjectRef = this.patient?.id ? `Patient/${this.patient.id}` : undefined;
      const patientId  = this.patient?.id;

      // 2) Latest Visit
      const lastVisit = subjectRef ? await this.fetchLastVisit(subjectRef) : '';

      // 3) Parallel resource fetches
      let conditionsB: fhir4.Bundle<fhir4.Condition> | undefined;
      let medsB:
        fhir4.Bundle<fhir4.MedicationStatement | fhir4.MedicationRequest>
        | undefined;
      let famB:        fhir4.Bundle<fhir4.FamilyMemberHistory> | undefined;
      let vitalsB:     fhir4.Bundle<fhir4.Observation> | undefined;
      let labsB:       fhir4.Bundle<fhir4.Observation> | undefined;
      let lifestyleB:  fhir4.Bundle<fhir4.Observation> | undefined;
      let surveyB:     fhir4.Bundle<fhir4.QuestionnaireResponse> | undefined;

      if (subjectRef && patientId) {
        const results = await Promise.allSettled([
          this.sof.search<fhir4.Condition>('Condition', { subject: subjectRef }),
          this.fetchMedications(patientId),
          this.sof.search<fhir4.FamilyMemberHistory>('FamilyMemberHistory', { patient: patientId, _count: 50 }),
          this.sof.search<fhir4.Observation>('Observation', { subject: subjectRef, category: 'vital-signs',   _count: 50, _sort: '-date' }),
          this.sof.search<fhir4.Observation>('Observation', { subject: subjectRef, category: 'laboratory',    _count: 50, _sort: '-date' }),
          this.sof.search<fhir4.Observation>('Observation', { subject: subjectRef, category: 'social-history', _count: 50, _sort: '-date' }),
          this.safeQRSearch(patientId)
        ]);

        if (results[0].status === 'fulfilled') conditionsB = results[0].value;
        if (results[1].status === 'fulfilled') medsB       = results[1].value;
        if (results[2].status === 'fulfilled') famB        = results[2].value;
        if (results[3].status === 'fulfilled') vitalsB     = results[3].value;
        if (results[4].status === 'fulfilled') labsB       = results[4].value;
        if (results[5].status === 'fulfilled') lifestyleB  = results[5].value as any;
        if (results[6].status === 'fulfilled') surveyB     = results[6].value as any;
      }

      // 4) Transform FHIR -> UI inputs
      this.conditionItems = this.buildConditionItems(conditionsB);
      this.symptomItems   = this.buildSymptomItems(conditionsB);
      this.medicationItems= this.buildMedicationItems(medsB);
      this.familyItems    = this.buildFamilyItems(famB);

      this.vitalItems     = this.buildObservationItems('vitals', vitalsB);
      this.labItems       = this.buildObservationItems('labs',   labsB);

      this.lifestyleItems = this.buildLifestyleItems(lifestyleB);
      this.surveyItems    = this.buildSurveyItems(surveyB);
    } catch (err) {
      console.error('Error loading FHIR data', err);
      this.conditionItems  = [];
      this.symptomItems    = [];
      this.medicationItems = [];
      this.familyItems     = [];
      this.vitalItems      = [];
      this.labItems        = [];
      this.lifestyleItems  = [];
      this.surveyItems     = [];
    }
  }

  ngOnDestroy(): void {
    if (this.isStudyCaseSummary) this.summaryShell.clearStudyPatient();
  }

  private presentFrozenItems(items: PatientSummaryItem[]): PatientSummaryItem[] {
    return items.map(item => ({
      ...item,
      secondary: this.formatFrozenSecondary(item.primary, item.secondary),
      source: undefined
    }));
  }

  private formatFrozenSecondary(label: string, secondary?: string): string | undefined {
    if (!secondary) return secondary;
    const match = secondary.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) return secondary;

    const decimals: Record<string, number> = {
      'Age': 0,
      'Pulse': 0,
      'BMI': 2,
      'Standing height': 1,
      'Waist circumference': 1,
      'Hip circumference': 1,
      'Systolic blood pressure': 1,
      'Diastolic blood pressure': 1,
      'Sleep duration': 1
    };
    const precision = decimals[label] ?? 2;
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return secondary;
    const displayed = label === 'Age' ? Math.floor(value).toString() : value.toFixed(precision);
    return `${displayed}${match[2]}`;
  }

  /** Latest Encounter fetch */
  private async fetchLastVisit(subject: string): Promise<string> {
    try {
      const b = await this.sof.search<fhir4.Encounter>('Encounter', {
        subject,
        _sort: '-date',
        _count: 1
      });

      const e = b?.entry?.[0]?.resource as fhir4.Encounter | undefined;
      const d = e?.period?.start ?? e?.period?.end ?? e?.meta?.lastUpdated ?? '';

      // format DD/MM/YYYY
      return d ? this.formatDate(d as string) : '';
    } catch {
      return '';
    }
  }

  /** Decide per-item source */
  private resolveSourceFor(r: { meta?: fhir4.Meta }): { source: string } {
    const isPatientGen = /patient-generated|patient|abacus/i.test(r.meta?.source || '')

    return isPatientGen
      ? { source: 'Patient' }
      : { source: 'EHR' };
  }

  private async fetchMedications(patientId: string) {
    try {
      return await this.sof.search<fhir4.MedicationStatement>(
        'MedicationStatement',
        { patient: patientId, _count: 50 }
      );
    } catch (e: any) {
      if (e?.status === 404) {
        return await this.sof.search<fhir4.MedicationRequest>(
          'MedicationRequest',
          { patient: patientId, _count: 50 }
        );
      }
      throw e;
    }
  }

  private medName(r: fhir4.MedicationStatement | fhir4.MedicationRequest): string {
    const cc = (r as any).medicationCodeableConcept;
    const ref = (r as any).medicationReference;

    const byCC =
      cc?.coding?.[0]?.display ??
      cc?.text;

    const byRef =
      ref?.display;

    const name = (byCC || byRef || '').trim();
    return name || 'Medication';
  }

  private cleanTxt(s?: string): string {
    if (!s) return '';
    return s
      .replace(/\b(Print|Historical Med)\b/gi, '') // vendor noise
      .replace(/\s*,\s*,+/g, ', ')                 // double commas
      .replace(/\s{2,}/g, ' ')                     // extra spaces
      .replace(/\s*,\s*$/,'')                      // trailing comma
      .trim();
  }

  private fmtDosePart(d?: fhir4.Dosage): string {
    if (!d) return '';

    if (d.text) return this.cleanTxt(d.text);

    const parts: string[] = [];

    const dr = d.doseAndRate?.[0];
    const dq = (d as any).doseQuantity || dr?.doseQuantity;
    if (dq?.value !== undefined) {
      parts.push(`${dq.value}${dq.unit ? ' ' + dq.unit : ''}`);
    }

    const routeDisp =
      d.route?.coding?.[0]?.display || d.route?.text;
    if (routeDisp) parts.push(routeDisp);

    const t = d.timing;
    const rep = t?.repeat;
    if (rep?.frequency && rep?.period && rep?.periodUnit) {
      parts.push(`${rep.frequency} × ${rep.period} per ${rep.periodUnit}`);
    }

    return this.cleanTxt(parts.filter(Boolean).join(', '));
  }

  private medDate(r: fhir4.MedicationStatement | fhir4.MedicationRequest): string | undefined {
    const raw =
      (r as fhir4.MedicationStatement).effectiveDateTime as string ||
      (r as fhir4.MedicationStatement).effectivePeriod?.start as string ||
      (r as fhir4.MedicationStatement).dateAsserted as string ||
      (r as fhir4.MedicationRequest).authoredOn as string ||
      '';
    return raw ? this.formatDate(raw) : undefined;
  }

  private safeQRSearch(patientId: string): Promise<fhir4.Bundle<fhir4.QuestionnaireResponse> | undefined> {
    return this.sof
      .search<fhir4.QuestionnaireResponse|fhir4.Questionnaire>('QuestionnaireResponse', { patient: patientId, _count: 50, _include: '*' })
      .then(response => {
        this.questionnaires = response.entry?.filter(entry => entry.resource?.resourceType === 'Questionnaire')
          .map(entry => <fhir4.Questionnaire>entry.resource)
          .reduce((o, q) => {
            o['Questionnaire/' + q.id] = q
            return o;
          }, {} as {[ref: string]: fhir4.Questionnaire})
        response.entry = response.entry?.filter(entry => entry.resource?.resourceType === 'QuestionnaireResponse')
        return <fhir4.Bundle<fhir4.QuestionnaireResponse>>response;
      })
      .catch((e: any) => {
        if (e?.status === 403 || e?.status === 404) return undefined;
        throw e;
      });
  }

  /** ---------- Helpers for Observations ---------- */

  /** Stable key per observation; prefer code, then display, then text */
  private obsKey(o: fhir4.Observation): string {
    return (
      o.code?.coding?.[0]?.code ??
      o.code?.coding?.[0]?.display ??
      o.code?.text ??
      ''
    ).trim().toLowerCase();
  }

  /** Compact value formatter used by vitals/labs/lifestyle */
  private fmtObsValue(o: fhir4.Observation): string {
    const q = o.valueQuantity;
    if (q && (q.value !== undefined || q.unit)) {
      const v = (q.value ?? '').toString();
      const u = q.unit || q.code || q.system || '';
      return [v, u].filter(Boolean).join(' ');
    }
    return (
      o.valueString ??
      o.valueCodeableConcept?.coding?.[0]?.display ??
      o.valueCodeableConcept?.text ??
      ''
    );
  }

  /** Format date string as DD/MM/YYYY */
  private formatDate(dateStr?: string): string {
    if (!dateStr) return '';

    const strict = moment(dateStr, moment.ISO_8601, true);
    if (strict.isValid()) return strict.format(PatientSummaryComponent.DATE_FMT);

    const loose = moment(dateStr);
    return loose.isValid() ? loose.format(PatientSummaryComponent.DATE_FMT) : '';
  }

  /** ---------- Builders ---------- */

  private isSymptom(c: fhir4.Condition) {
    const cats = c.category?.flatMap(cat => cat.coding ?? []) ?? [];
    const catHit = cats.some(cd =>
      /symptom|complaint/i.test(cd.code || '') || /symptom|complaint/i.test(cd.display || '')
    );
    const codeTxt = (c.code?.text || c.code?.coding?.[0]?.display || '').toLowerCase();
    return catHit || /pain|ache|cough|fever|toothache|back pain|symptom/.test(codeTxt);
  };

  private buildConditionItems(bundle?: fhir4.Bundle<fhir4.Condition>): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];
    return entries
      .map(e => e.resource as fhir4.Condition)
      .filter(c => !this.isSymptom(c))
      .map(c => {
      const primary =
        c?.code?.coding?.[0]?.display ?? c?.code?.text ?? 'Unknown Condition';
      const secondary =
        c?.clinicalStatus?.coding?.[0]?.code ??
        c?.verificationStatus?.coding?.[0]?.code ??
        c?.code?.coding?.[0]?.code ??
        undefined;
      const date = c?.recordedDate ? this.formatDate(c.recordedDate) : undefined;
      const { source } = this.resolveSourceFor(c || {});
      return { primary, secondary, date, source };
    });
  }

  private buildSymptomItems(bundle?: fhir4.Bundle<fhir4.Condition>): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];
    return entries
      .map(e => e.resource as fhir4.Condition)
      .filter(c => this.isSymptom(c))
      .map(c => {
        const primary = c.code?.coding?.[0]?.display ?? c.code?.text ?? 'Symptom';
        const date = c.recordedDate ? this.formatDate(c.recordedDate) : undefined;
        const { source } = this.resolveSourceFor(c || {});
        return { primary, date, source };
      });
  }

  private buildMedicationItems(
    bundle?: fhir4.Bundle<fhir4.MedicationStatement | fhir4.MedicationRequest>
  ): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];

    return entries.map(e => {
      const r = e.resource as fhir4.MedicationStatement | fhir4.MedicationRequest;

      const primary = this.medName(r);

      // dosage: MedicationStatement.dosage[] OR MedicationRequest.dosageInstruction[]
      const d1 = (r as fhir4.MedicationStatement).dosage?.[0];
      const d2 = (r as fhir4.MedicationRequest).dosageInstruction?.[0] as fhir4.Dosage | undefined;
      const secondaryRaw = this.fmtDosePart(d1 || d2);
      const secondary = this.cleanTxt(secondaryRaw) || undefined;

      const date = this.medDate(r);

      const { source } = this.resolveSourceFor(r || {});
      return { primary, secondary, date, source };
    });
  }

  private buildFamilyItems(bundle?: fhir4.Bundle<fhir4.FamilyMemberHistory>): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];
    return entries.map(e => {
      const f = e.resource as fhir4.FamilyMemberHistory;
      const relation = f.relationship?.coding?.[0]?.display ?? f.relationship?.text ?? 'Relative';
      const cond = f.condition?.[0];
      const condName =
        cond?.code?.coding?.[0]?.display ?? cond?.code?.text ?? 'Condition';
      const primary = condName;
      const secondary = relation + (cond?.onsetString ? ` — ${cond.onsetString}` : '');
      const raw = (f.meta?.lastUpdated as string) ?? '';
      const date = raw ? this.formatDate(raw) : undefined;
      const { source } = this.resolveSourceFor(f || {});
      return { primary, secondary, date, source };
    });
  }

  private buildObservationItems(
    kind: 'vitals' | 'labs',
    bundle?: fhir4.Bundle<fhir4.Observation>
  ): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];

    const seen = new Set<string>();
    const out: PatientSummaryItem[] = [];

    for (const e of entries) {
      const o = e.resource as fhir4.Observation;
      const key = this.obsKey(o);
      if (!key || seen.has(key)) continue;  // keep only the newest observation per key
      seen.add(key);

      const primary =
        o.code?.coding?.[0]?.display ??
        o.code?.text ??
        (kind === 'vitals' ? 'Vital' : 'Lab');

      const secondary = this.fmtObsValue(o) || undefined;

      const d =
        (o.effectiveDateTime as string) ??
        (o.effectivePeriod?.start as string) ??
        (o.issued as string) ??
        '';
      const date = d ? this.formatDate(d) : undefined;

      const { source } = this.resolveSourceFor(o || {});
      out.push({ primary, secondary, date, source });
    }

    return out;
  }

  private buildLifestyleItems(bundle?: fhir4.Bundle<fhir4.Observation>): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];

    const wanted = /steps|sleep|alcohol|smoking|tobacco|cigarette|drink|exercise|activity/i;

    const seen = new Set<string>();
    const out: PatientSummaryItem[] = [];

    for (const e of entries) {
      const o = (e.resource as fhir4.Observation);
      const name = o.code?.coding?.[0]?.display || o.code?.text || '';
      if (!wanted.test(name)) continue;

      const key = this.obsKey(o);
      if (!key || seen.has(key)) continue; // newest-first; keep first per key
      seen.add(key);

      const primary =
        o.code?.coding?.[0]?.display ?? o.code?.text ?? 'Lifestyle';

      const secondary = this.fmtObsValue(o) || undefined;

      const d =
        (o.effectiveDateTime as string) ??
        (o.effectivePeriod?.start as string) ??
        (o.issued as string) ??
        '';
      const date = d ? this.formatDate(d) : undefined;

      const { source } = this.resolveSourceFor(o || {});
      out.push({ primary, secondary, date, source });
    }

    return out;
  }

  private buildSurveyItems(bundle?: fhir4.Bundle<fhir4.QuestionnaireResponse>): PatientSummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];

    const titleFrom = (qr: fhir4.QuestionnaireResponse) => {
      const q = qr.questionnaire as string | undefined;
      if (q && this.questionnaires && this.questionnaires[q]?.title) {
        return <string>this.questionnaires[q].title;
      }
      return 'Questionnaire';
    };

    // Keep only the newest per questionnaire
    const seen = new Set<string>();
    const out: PatientSummaryItem[] = [];

    for (const e of entries) {
      const qr = e.resource as fhir4.QuestionnaireResponse;
      const canonical = (qr.questionnaire as string) || titleFrom(qr); // stable key
      const key = (canonical || '').toLowerCase();
      if (!key || seen.has(key)) continue;  // already have the newest for this questionnaire
      seen.add(key);

      const primary = titleFrom(qr);
      const raw =
        (qr.authored as string) ||
        (qr.meta?.lastUpdated as string) ||
        '';
      const date = raw ? this.formatDate(raw) : undefined;

      const linkHref = e.fullUrl || '';
      const { source } = this.resolveSourceFor(qr || {});
      out.push({
        primary,
        date,
        source,
        linkLabel: linkHref ? 'See response' : undefined,
        linkHref: linkHref || undefined
      });
    }

    return out;
  }

  /** Build full name if name.text missing */
  private buildHumanName(p: fhir4.Patient): string {
    const given = p.name?.[0]?.given?.join(' ') ?? '';
    const family = p.name?.[0]?.family ?? '';
    return `${given} ${family}`.trim();
  }

  /** Calculate age safely */
  private calculateAge(birthDate?: string): string {
    if (!birthDate) return '';
    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return `${age} years`;
  }
}
