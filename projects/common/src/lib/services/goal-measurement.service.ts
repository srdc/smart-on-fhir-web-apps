import {Injectable, Optional} from '@angular/core';
import {CdsHooksService} from 'cds-hooks';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {CdsUtils} from '../utils/cds-utils';

/** What can be measured for a goal: the code of its target, and the type and unit of the value */
export interface GoalMeasurement {
  /** system|code (or the text) of the measured code */
  key: string;
  /** Observation.code */
  code: fhir4.CodeableConcept;
  label: string;
  /** valueQuantity (with the unit of the target) or valueCodeableConcept */
  kind: 'quantity' | 'concept';
  /** Unit of the target, copied to valueQuantity (unit, system, code) */
  unit?: { unit?: string, system?: string, code?: string };
  /** Target text, e.g. "< 140 mm[Hg]" or "Former smoker" */
  target?: string;
  /** Target values of CodeableConcept targets (offered first) */
  targetConcepts: fhir4.Coding[];
}

/** An answer offered for a CodeableConcept measurement, with where it comes from */
export interface MeasurementOption {
  coding: fhir4.Coding;
  /** goal: a goal target; cds: the answer list of a CDS service concept (its ValueSet); history: an earlier observation */
  source: 'goal' | 'cds' | 'history';
}

/** CDS services that provide infrastructure, not decision support */
const UTILITY_SERVICES = ['definition', 'valueset', 'in-memory-search'];
/** Goals no measurement is recorded for */
const CLOSED_GOAL_STATUSES = ['cancelled', 'entered-in-error', 'rejected'];

const codingKey = (coding: fhir4.Coding) => (coding.system || '') + '|' + (coding.code || '');

/**
 * Measurements (observations) the user can record for the goals of a care plan: the measured code of a goal target, a
 * quantity in the unit of the target, or a coded value. Answers of coded values come from the goal targets, the answer
 * lists of the CDS services' concepts with the same code (resolved from their ValueSets by the 'definition' service),
 * and the patient's earlier observations; a free text answer is always possible.
 */
@Injectable({
  providedIn: 'root'
})
export class GoalMeasurementService {

  /** Answer lists of the CDS concepts by system|code, loaded once */
  private cdsOptions?: Promise<Map<string, fhir4.Coding[]>>;

  // not `cds?:` — an optional parameter makes the declaration emit infer the type (TS2742 with the linked fhir typings)
  constructor(private sof: SmartOnFhirService, @Optional() private cds: CdsHooksService<fhir4.Resource> | null) {
  }

  /** Measurements of the goals (one per code; goals without a coded target and value type are skipped) */
  static measurements(goals: fhir4.Goal[]): GoalMeasurement[] {
    const byKey = new Map<string, GoalMeasurement>();
    for (const goal of goals.filter(goal => !CLOSED_GOAL_STATUSES.includes(goal.lifecycleStatus))) {
      for (const target of goal.target?.length ? goal.target : [<fhir4.GoalTarget>{}]) {
        const code = target.measure?.coding?.length || target.measure?.text ? target.measure : goal.description;
        const coding = code?.coding?.find(c => c.code);
        const key = coding ? codingKey(coding) : code?.text;
        if (!code || !key) continue;
        const quantity = target.detailQuantity || target.detailRange?.high || target.detailRange?.low;
        const concept = target.detailCodeableConcept;
        if (!quantity && !concept) continue;
        const existing = byKey.get(key);
        if (existing) {
          concept?.coding?.filter(c => c.code && !existing.targetConcepts.some(t => codingKey(t) === codingKey(c)))
            .forEach(c => existing.targetConcepts.push(c));
          continue;
        }
        const label = code.text || coding?.display || goal.description?.text || key;
        byKey.set(key, {
          key,
          code: JSON.parse(JSON.stringify({coding: code.coding, text: code.text})),
          label,
          kind: quantity ? 'quantity' : 'concept',
          unit: quantity ? {unit: quantity.unit, system: quantity.system, code: quantity.code} : undefined,
          target: GoalMeasurementService.targetText(target),
          targetConcepts: (concept?.coding || []).filter(c => c.code).map(c => ({...c}))
        });
      }
    }
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  static targetText(target: fhir4.GoalTarget): string | undefined {
    const q = (quantity?: fhir4.Quantity) => quantity ? `${quantity.value ?? ''} ${quantity.unit || quantity.code || ''}`.trim() : '';
    if (target.detailQuantity) return q(target.detailQuantity);
    if (target.detailRange) {
      return [target.detailRange.low ? '> ' + q(target.detailRange.low) : '', target.detailRange.high ? '< ' + q(target.detailRange.high) : '']
        .filter(Boolean).join(', ');
    }
    if (target.detailCodeableConcept) {
      return target.detailCodeableConcept.text || target.detailCodeableConcept.coding?.map(c => c.display || c.code).join(', ');
    }
    return undefined;
  }

  /** Answers for a coded measurement: goal targets, CDS answer lists, then the patient's earlier answers (no duplicates) */
  async options(measurement: GoalMeasurement, patientId?: string): Promise<MeasurementOption[]> {
    const options: MeasurementOption[] = measurement.targetConcepts.map(coding => ({coding, source: 'goal' as const}));
    const codings = measurement.code.coding?.filter(c => c.code) || [];
    const cds = await this.loadCdsOptions().catch(() => new Map<string, fhir4.Coding[]>());
    codings.flatMap(c => cds.get(codingKey(c)) || []).forEach(coding => options.push({coding, source: 'cds'}));
    if (patientId && codings.length) {
      const bundle = await this.sof.search<fhir4.Observation>('Observation', {
        patient: 'Patient/' + patientId,
        code: codings.map(c => encodeURIComponent(codingKey(c))).join(','),
        _count: 100
      }).catch(() => undefined);
      (bundle?.entry || []).flatMap(entry => entry.resource?.valueCodeableConcept?.coding || [])
        .filter(c => c.code).forEach(coding => options.push({coding, source: 'history'}));
    }
    const seen = new Set<string>();
    return options.filter(option => !seen.has(codingKey(option.coding)) && !!seen.add(codingKey(option.coding)));
  }

  /** Observation for a measurement */
  static observation(measurement: GoalMeasurement, patientId: string, value: number | fhir4.CodeableConcept,
                     effectiveDateTime = new Date().toISOString()): fhir4.Observation {
    return {
      resourceType: 'Observation',
      status: 'final',
      code: JSON.parse(JSON.stringify(measurement.code)),
      subject: {reference: 'Patient/' + patientId},
      effectiveDateTime,
      ...(typeof value === 'number'
        ? {valueQuantity: {value, ...Object.fromEntries(Object.entries(measurement.unit || {}).filter(([, v]) => v !== undefined))}}
        : {valueCodeableConcept: value})
    };
  }

  /** CodeableConcept concepts of the CDS services (definition service), by the system|code of the concept */
  private loadCdsOptions(): Promise<Map<string, fhir4.Coding[]>> {
    if (!this.cdsOptions) {
      this.cdsOptions = (async () => {
        const map = new Map<string, fhir4.Coding[]>();
        if (!this.cds) return map;
        const serviceIds = (await this.cds.listServices()).filter(id => !UTILITY_SERVICES.includes(id));
        await Promise.all(serviceIds.map(async serviceId => {
          const response = await this.cds!.callService({serviceId: 'definition', context: {serviceId}, prefetch: {}}).catch(() => undefined);
          const detail = response?.cards?.at(0)?.detail;
          const concepts: { [id: string]: any } = detail ? CdsUtils.parseCardDetail(detail) : {};
          Object.values(concepts).filter(concept => concept?.type === 'CodeableConcept' && concept.code?.code && Array.isArray(concept.select))
            .forEach(concept => {
              const key = codingKey(concept.code);
              const list = map.get(key) || [];
              (<fhir4.Coding[]>concept.select).filter(c => c?.code && !list.some(o => codingKey(o) === codingKey(c)))
                .forEach(c => list.push({system: c.system, code: c.code, display: c.display}));
              map.set(key, list);
            });
        }));
        return map;
      })();
      this.cdsOptions.catch(() => this.cdsOptions = undefined);
    }
    return this.cdsOptions;
  }
}
