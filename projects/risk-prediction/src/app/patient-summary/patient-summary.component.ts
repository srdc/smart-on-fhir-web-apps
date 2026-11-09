import { Component, OnInit } from '@angular/core';
import { SmartOnFhirService } from 'ng-smart-on-fhir';
import { HealthCardProfile, HealthCardProfileService, IpsDocumentService } from 'common';
import format from 'date-fns/format';
import isValid from 'date-fns/is_valid';

interface SidebarRow {
  label: string;
  value: string;
}

interface SummaryItem {
  primary: string;
  secondary?: string;
  date?: string;
  source?: string;        // badge text
  linkLabel?: string;     // optional link text (e.g., "See response")
  linkHref?: string;      // optional link URL
}

@Component({
  selector: 'rp-patient-summary',
  templateUrl: './patient-summary.component.html',
  styleUrls: ['./patient-summary.component.scss']
})
export class PatientSummaryComponent implements OnInit {
  // Raw FHIR
  patient?: fhir4.Patient;

  // View-model for UI components
  sidebarRows: SidebarRow[] = [];

  // Panels
  conditionItems:  SummaryItem[] = [];
  allergyItems:    SummaryItem[] = [];
  medicationItems: SummaryItem[] = [];
  familyItems:     SummaryItem[] = [];
  labItems:        SummaryItem[] = [];
  vitalItems:      SummaryItem[] = [];
  lifestyleItems:  SummaryItem[] = [];
  surveyItems:     SummaryItem[] = [];

  // Paging states
  itemsPerPage = 10;

  conditionPage = 1;
  allergyPage   = 1;
  medicationPage= 1;
  familyPage    = 1;
  vitalPage     = 1;
  labPage       = 1;
  lifestylePage = 1;
  surveyPage    = 1;


  // Sharing (IPS download / SMART Health Card)
  healthCardProfiles: HealthCardProfile[] = [];  // empty when the FHIR server does not support $health-cards-issue
  ipsLoading = false;
  /** Create Smart Health Card dialog (app-share-health-card-dialog) */
  shareDialogOpen = false;
  sharingError?: string;

  private static readonly DATE_FMT = 'DD/MM/YYYY';
  private questionnaires: { [ref: string]: fhir4.Questionnaire }|undefined;

  constructor(private sof: SmartOnFhirService,
              private ipsDocuments: IpsDocumentService,
              private healthCardProfileService: HealthCardProfileService) {}

  async ngOnInit(): Promise<void> {
    this.healthCardProfileService.profiles().then(profiles => this.healthCardProfiles = profiles);
    try {
      // 1) Patient
      this.patient = await this.sof.getPatient();
      const subjectRef = this.patient?.id ? `Patient/${this.patient.id}` : undefined;
      const patientId  = this.patient?.id;

      // 2) Latest Visit
      const lastVisit = subjectRef ? await this.fetchLastVisit(subjectRef) : '';

      // 3) Parallel resource fetches
      let conditionsB: fhir4.Bundle<fhir4.Condition> | undefined;
      let allergiesB:  fhir4.Bundle<fhir4.AllergyIntolerance> | undefined;
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
          this.safeQRSearch(patientId),
          this.sof.search<fhir4.AllergyIntolerance>('AllergyIntolerance', { patient: subjectRef, _count: 50 })
        ]);

        if (results[0].status === 'fulfilled') conditionsB = results[0].value;
        if (results[1].status === 'fulfilled') medsB       = results[1].value;
        if (results[2].status === 'fulfilled') famB        = results[2].value;
        if (results[3].status === 'fulfilled') vitalsB     = results[3].value;
        if (results[4].status === 'fulfilled') labsB       = results[4].value;
        if (results[5].status === 'fulfilled') lifestyleB  = results[5].value as any;
        if (results[6].status === 'fulfilled') surveyB     = results[6].value as any;
        if (results[7].status === 'fulfilled') allergiesB  = results[7].value as any;
      }

      // 4) Transform FHIR -> UI inputs
      this.sidebarRows    = this.buildSidebarRows(this.patient, lastVisit);
      this.conditionItems = this.buildConditionItems(conditionsB);
      this.allergyItems   = this.buildAllergyItems(allergiesB);
      this.medicationItems= this.buildMedicationItems(medsB);
      this.familyItems    = this.buildFamilyItems(famB);

      this.vitalItems     = this.buildObservationItems('vitals', vitalsB);
      this.labItems       = this.buildObservationItems('labs',   labsB);

      this.lifestyleItems = this.buildLifestyleItems(lifestyleB);
      this.surveyItems    = this.buildSurveyItems(surveyB);
    } catch (err) {
      console.error('Error loading FHIR data', err);
      this.sidebarRows     = [];
      this.conditionItems  = [];
      this.allergyItems    = [];
      this.medicationItems = [];
      this.familyItems     = [];
      this.vitalItems      = [];
      this.labItems        = [];
      this.lifestyleItems  = [];
      this.surveyItems     = [];
    }
  }

  /** Build the International Patient Summary of the patient and download it as a FHIR document Bundle */
  async downloadIPS(): Promise<void> {
    if (!this.patient) return;
    this.ipsLoading = true;
    this.sharingError = undefined;
    try {
      const ips = await this.ipsDocuments.generate(this.patient);
      this.ipsDocuments.download(ips, `IPS-${this.patient.id}.json`);
    } catch (err) {
      console.error('IPS could not be generated', err);
      this.sharingError = 'The patient summary (IPS) could not be generated.';
    } finally {
      this.ipsLoading = false;
    }
  }

  /** Patient -> sidebar rows */
  private buildSidebarRows(p?: fhir4.Patient, lastVisit: string = ''): SidebarRow[] {
    if (!p) return [];
    return [
      { label: 'Name',       value: p.name?.[0]?.text || this.buildHumanName(p) || '' },
      { label: 'Last Visit', value: lastVisit },
      { label: 'Age',        value: this.calculateAge(p.birthDate) },
      { label: 'Sex',        value: p.gender ?? '' },
      { label: 'Ethnicity',  value: this.getEthnicity(p) }
    ];
  }

  /** Try to read ethnicity if present (otherwise empty) */
  private getEthnicity(p: fhir4.Patient): string {
    const ext = p.extension ?? [];
    const e = ext.find(x =>
      (x.url || '').toLowerCase().includes('ethnic') ||
      (x.url || '').toLowerCase().includes('race')
    ) as any;

    const text =
      e?.valueString ??
      e?.valueCodeableConcept?.text ??
      e?.valueCodeableConcept?.coding?.[0]?.display ??
      '';

    return text || '';
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
        { patient: 'Patient/' + patientId, _count: 50 }
      );
    } catch (e: any) {
      if (e?.status === 404) {
        return await this.sof.search<fhir4.MedicationRequest>(
          'MedicationRequest',
          { patient: 'Patient/' + patientId, _count: 50 }
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
    // if (!dateStr) return '';
    //
    // const date = new Date(dateStr);
    //
    // return isValid(date)
    //   ? format(date, 'dd/MM/yyyy')
    //   : '';
    return dateStr || '';
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

  private buildConditionItems(bundle?: fhir4.Bundle<fhir4.Condition>): SummaryItem[] {
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

  private buildAllergyItems(bundle?: fhir4.Bundle<fhir4.AllergyIntolerance>): SummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];
    return entries
      .map(e => e.resource as fhir4.AllergyIntolerance)
      .filter(a => a?.resourceType === 'AllergyIntolerance'
        && !a.verificationStatus?.coding?.some(cd => cd.code === 'entered-in-error'))
      .map(a => {
        const primary = a.code?.coding?.[0]?.display ?? a.code?.text ?? 'Unknown Allergy';
        // reaction manifestations, otherwise criticality / clinical status
        const manifestations = (a.reaction ?? [])
          .flatMap(r => r.manifestation ?? [])
          .map(m => m.coding?.[0]?.display ?? m.text)
          .filter((m): m is string => !!m);
        const secondary = manifestations.length
          ? manifestations.join(', ')
          : (a.criticality ? `criticality: ${a.criticality}` : a.clinicalStatus?.coding?.[0]?.code);
        const d = a.recordedDate ?? a.onsetDateTime ?? '';
        const date = d ? this.formatDate(d) : undefined;
        const { source } = this.resolveSourceFor(a || {});
        return { primary, secondary, date, source };
      });
  }

  private buildMedicationItems(
    bundle?: fhir4.Bundle<fhir4.MedicationStatement | fhir4.MedicationRequest>
  ): SummaryItem[] {
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

  private buildFamilyItems(bundle?: fhir4.Bundle<fhir4.FamilyMemberHistory>): SummaryItem[] {
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
  ): SummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];

    const seen = new Set<string>();
    const out: SummaryItem[] = [];

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

  private buildLifestyleItems(bundle?: fhir4.Bundle<fhir4.Observation>): SummaryItem[] {
    const entries = bundle?.entry ?? [];
    if (!entries.length) return [];

    const wanted = /steps|sleep|alcohol|smoking|tobacco|cigarette|drink|exercise|activity/i;

    const seen = new Set<string>();
    const out: SummaryItem[] = [];

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

  private buildSurveyItems(bundle?: fhir4.Bundle<fhir4.QuestionnaireResponse>): SummaryItem[] {
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
    const out: SummaryItem[] = [];

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
