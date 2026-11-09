import { Injectable } from '@angular/core';
import { Observable, of, forkJoin, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HistoryEvent } from './history.types';
import { HISTORY_VOCAB, TOP_MEDICATIONS_LIST } from './vocab.history';
import { SmartOnFhirService } from 'ng-smart-on-fhir';

const ENABLE_GENERIC_CONDITION_FALLBACK = false;

@Injectable({ providedIn: 'root' })
export class HistoryBuilderService {
  constructor(private smart: SmartOnFhirService) {}

  getHistoryEvents(patientId?: string): Observable<HistoryEvent[]> {
    if (!patientId) return of([]);

    const subject = `Patient/${patientId}`;

    return forkJoin({
      conditions: this.fetchConditions(subject).pipe(catchError(() => of<HistoryEvent[]>([]))),
      bmi:        this.fetchBmiDerived(subject).pipe(catchError(() => of<HistoryEvent[]>([]))),
      lifestyle:  this.fetchLifestyle(subject).pipe(catchError(() => of<HistoryEvent[]>([]))),
      // ADD THIS: Fetch medications in parallel
      meds:       this.fetchMedications(subject).pipe(catchError(() => of<HistoryEvent[]>([])))
    }).pipe(
      map(({ conditions, bmi, lifestyle, meds }) => {
        // Merge everything, including meds
        const all = [...conditions, ...bmi, ...lifestyle, ...meds];
        all.sort((a, b) => a.date.localeCompare(b.date)); // earliest→latest
        console.debug('[History] built events:', { conditions: conditions.length, bmi: bmi.length, lifestyle: lifestyle.length, meds: meds.length, total: all.length });
        return all;
      })
    );
  }

  // ---------------- CONDITIONS ----------------
  private fetchConditions(subjectRef: string): Observable<HistoryEvent[]> {
    const params: any = {
      patient: subjectRef,
      category: 'problem-list-item,encounter-diagnosis',
      _count: 200
    };

    const promise: Promise<fhir4.Bundle> = (this.smart as any).search
      ? (this.smart as any).search('Condition', params)
      : (this.smart as any).request({ url: 'Condition', method: 'GET', params });

    return from(promise).pipe(
      map((bundle: fhir4.Bundle) => {
        const entries = (bundle?.entry ?? []).map(e => e.resource).filter(Boolean) as fhir4.Condition[];

        const subtypeMatches = entries
          .map(c => this.conditionToEvent(c))
          .filter((x): x is HistoryEvent => !!x);

        // Keep earliest per subtype
        const earliestBySubtype = new Map<string, HistoryEvent>();
        for (const ev of subtypeMatches) {
          const prev = earliestBySubtype.get(ev.subtype);
          if (!prev || ev.date < prev.date) earliestBySubtype.set(ev.subtype, ev);
        }
        const deduped = Array.from(earliestBySubtype.values());

        if (deduped.length || !ENABLE_GENERIC_CONDITION_FALLBACK) return deduped;

        // Fallback
        const generics: HistoryEvent[] = entries
          .map(c => this.genericConditionEvent(c))
          .filter((x): x is HistoryEvent => !!x)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3);
        return generics;
      })
    );
  }

  // ---------------- MEDICATIONS (NEW) ----------------
  private fetchMedications(subjectRef: string): Observable<HistoryEvent[]> {
    const params: any = {
      patient: subjectRef,
      status: 'active,completed',
      _count: 100,
      _sort: '-date' // Get newest first so we can pick the latest refill
    };

    const promise: Promise<fhir4.Bundle> = (this.smart as any).search
      ? (this.smart as any).search('MedicationRequest', params)
      : (this.smart as any).request({ url: 'MedicationRequest', method: 'GET', params });

    return from(promise).pipe(
      map((bundle: fhir4.Bundle) => {
        const resources = (bundle?.entry ?? []).map(e => e.resource).filter(Boolean) as fhir4.MedicationRequest[];
        if (!resources.length) return [];

        const events: HistoryEvent[] = [];
        const seenNames = new Set<string>();

        for (const mr of resources) {
          // Get the display name
          const text = mr.medicationCodeableConcept?.text
            || mr.medicationCodeableConcept?.coding?.[0]?.display
            || 'Unknown';
          const lowerText = text.toLowerCase();

          // 1. Filter: Must be in our TOP 10 List
          const isTop10 = TOP_MEDICATIONS_LIST.some(key => lowerText.includes(key));
          if (!isTop10) continue;

          // 2. Dedup: Only keep the most recent instance of this drug
          if (seenNames.has(lowerText)) continue;
          seenNames.add(lowerText);

          const date = mr.authoredOn ? mr.authoredOn.substring(0, 10) : '';
          if (!date) continue;

          events.push({
            id: `MedicationRequest/${mr.id}`,
            kind: 'medication',
            subtype: 'top-med',
            title: text,
            date: date,
            iconKey: 'medication' // Will use the pill icon
          });
        }

        return events;
      })
    );
  }

  // ---------------- HELPERS (Conditions) ----------------
  private conditionToEvent(cond: fhir4.Condition): HistoryEvent | null {
    const subtype = this.detectConditionSubtype(cond);
    if (!subtype) return null;

    const d = this.getConditionDate(cond);
    if (!d) return null;

    const def = (HISTORY_VOCAB.conditions as any)[subtype];
    const title = def?.title ?? this.bestConditionTitle(cond) ?? subtype;

    return {
      id: `Condition/${cond.id ?? `${subtype}-${d}`}`,
      kind: 'condition',
      subtype,
      title,
      date: d,
      iconKey: def?.iconKey ?? 'condition'
    };
  }

  private genericConditionEvent(cond: fhir4.Condition): HistoryEvent | null {
    const d = this.getConditionDate(cond);
    const title = this.bestConditionTitle(cond);
    if (!d || !title) return null;
    return {
      id: `Condition/${cond.id ?? `generic-${d}`}`,
      kind: 'condition',
      subtype: 'other',
      title,
      date: d,
      iconKey: 'condition'
    };
  }

  private detectConditionSubtype(cond: fhir4.Condition): string | null {
    const cc = cond.code;
    const text = (cc?.text ?? '').toLowerCase();
    const displays = (cc?.coding ?? []).map(c => (c.display ?? '').toLowerCase()).filter(Boolean);
    const codes = (cc?.coding ?? []).map(c => (c.code ?? '').toUpperCase()).filter(Boolean);

    const hit = (re: RegExp) => re.test(text) || displays.some(d => re.test(d));

    if (hit(/\b(diabetes|dm2|type\s*2)\b/)) return 'diabetes';
    if (hit(/\b(cardio|coronary|ischemic|myocard|heart\s*(disease|attack)|mi|angina|cvd)\b/)) return 'cvd';
    if (hit(/\b(liver|hepat|cirrhosis|chronic\s*liver)\b/)) return 'cld';
    if (hit(/\b(respiratory|copd|asthma|emphysema|chronic\s*respiratory|bronch)\b/)) return 'crd';
    if (hit(/\b(kidney|renal|ckd|nephro|chronic\s*kidney)\b/)) return 'ckd';
    if (hit(/\b(osteoarthritis|oa)\b/)) return 'oa';
    if (hit(/\b(dementia|alzheimer)\b/)) return 'dementia';
    if (hit(/\b(depression|depressive)\b/)) return 'depression';

    const codeHas = (...prefixes: string[]) => codes.some(c => prefixes.some(p => c.startsWith(p)));
    if (codeHas('E11','250','44054006','73211009')) return 'diabetes';
    if (codeHas('I25','I21','I20','22298006','194828000','53741008')) return 'cvd';
    if (codeHas('K74','571','19943007','235856003')) return 'cld';
    if (codeHas('J44','J45','13645005','195967001')) return 'crd';
    if (codeHas('N18','585','709044004','431855005')) return 'ckd';
    if (codeHas('M19','715','396275006')) return 'oa';
    if (codeHas('F03','G30','331','52448006','26929004')) return 'dementia';
    if (codeHas('F32','F33','296','35489007')) return 'depression';
    return null;
  }

  private getConditionDate(cond: fhir4.Condition): string | null {
    const onsetDateTime = (cond as any).onsetDateTime as string | undefined;
    if (onsetDateTime) return onsetDateTime.substring(0, 10);
    const onsetPeriod = (cond as any).onsetPeriod as fhir4.Period | undefined;
    if (onsetPeriod?.start) return onsetPeriod.start.substring(0, 10);
    const recordedDate = (cond as any).recordedDate as string | undefined;
    if (recordedDate) return recordedDate.substring(0, 10);
    const lastUpdated = cond.meta?.lastUpdated;
    if (lastUpdated) return lastUpdated.substring(0, 10);
    return null;
  }

  private bestConditionTitle(cond: fhir4.Condition): string | null {
    const cc = cond.code;
    if (!cc) return null;
    if (cc.text) return cc.text;
    const coding = cc.coding?.find(c => c.display) ?? cc.coding?.[0];
    return coding?.display ?? null;
  }

  // ---------------- BMI ≥ 30 (DERIVED) ----------------
  private fetchBmiDerived(subjectRef: string): Observable<HistoryEvent[]> {
    const params: any = {
      patient: subjectRef,
      code: 'http://loinc.org|39156-5',
      _count: 200,
      _sort: 'date'
    };

    const promise: Promise<fhir4.Bundle> = (this.smart as any).search
      ? (this.smart as any).search('Observation', params)
      : (this.smart as any).request({ url: 'Observation', method: 'GET', params });

    return from(promise).pipe(
      map((bundle: fhir4.Bundle) => {
        const obs = (bundle?.entry ?? []).map(e => e.resource).filter(Boolean) as fhir4.Observation[];
        console.debug('[History] BMI obs count:', obs.length);
        if (!obs.length) return [];

        obs.sort((a, b) => this.getObservationDate(a).localeCompare(this.getObservationDate(b)));
        for (const o of obs) {
          const val = this.getObservationNumericValue(o);
          if (val != null && val >= 30) {
            const date = this.getObservationDate(o);
            return [this.makeBmiEvent(date)];
          }
        }
        return [];
      })
    );
  }

  // ---------------- LIFESTYLE (Smoking + Alcohol) ----------------
  private fetchLifestyle(subjectRef: string): Observable<HistoryEvent[]> {
    const params: any = {
      patient: subjectRef,
      category: 'social-history',
      _count: 200,
      _sort: '-date'
    };

    const promise: Promise<fhir4.Bundle> = (this.smart as any).search
      ? (this.smart as any).search('Observation', params)
      : (this.smart as any).request({ url: 'Observation', method: 'GET', params });

    return from(promise).pipe(
      map((bundle: fhir4.Bundle) => {
        const obs = (bundle?.entry ?? []).map(e => e.resource).filter(Boolean) as fhir4.Observation[];
        if (!obs.length) return [];

        const events: HistoryEvent[] = [];
        const seen = new Set<string>();

        for (const o of obs) {
          const name = (o.code?.coding?.[0]?.display || o.code?.text || '').toLowerCase();

          // Smoking
          const codeList = (o.code?.coding ?? []).map(c => `${c.system}|${c.code}`.toLowerCase());
          const isSmoking = codeList.includes('http://loinc.org|72166-2') || /smok/i.test(name);

          // Alcohol
          const isAlcohol = /alcohol/.test(name) || codeList.some(c => c.includes('alcohol'));

          let subtype: 'smoking' | 'alcohol' | null = null;
          if (isSmoking) subtype = 'smoking';
          else if (isAlcohol) subtype = 'alcohol';

          if (!subtype) continue;
          if (seen.has(subtype)) continue;
          seen.add(subtype);

          const date = this.getObservationDate(o);
          const def = (HISTORY_VOCAB.lifestyle as any)[subtype];
          events.push({
            id: `Observation/${subtype}-${o.id ?? date}`,
            kind: 'lifestyle',
            subtype,
            title: def?.title ?? (subtype === 'smoking' ? 'Smoking' : 'Alcohol Use'),
            date,
            iconKey: def?.iconKey ?? (subtype === 'smoking' ? 'smoking' : 'alcohol')
          });
        }

        events.sort((a, b) => a.date.localeCompare(b.date));
        return events;
      })
    );
  }

  private getObservationDate(o: fhir4.Observation): string {
    const dt = (o.effectiveDateTime as string | undefined)
      ?? (o.issued as string | undefined)
      ?? o.meta?.lastUpdated
      ?? '';
    return dt ? dt.substring(0, 10) : '1900-01-01';
  }

  private getObservationNumericValue(o: fhir4.Observation): number | null {
    const q = o.valueQuantity;
    if (q && typeof q.value === 'number') return q.value as number;
    if (Array.isArray(o.component)) {
      for (const c of o.component) {
        const vq = c.valueQuantity;
        if (vq && typeof vq.value === 'number') return vq.value as number;
      }
    }
    return null;
  }

  private makeBmiEvent(date: string): HistoryEvent {
    const def = HISTORY_VOCAB.lifestyle.bmi;
    return {
      id: `Observation/bmi>=30-${date}`,
      kind: 'derived',
      subtype: 'bmi',
      title: def.title,
      date,
      iconKey: def.iconKey
    };
  }
}
