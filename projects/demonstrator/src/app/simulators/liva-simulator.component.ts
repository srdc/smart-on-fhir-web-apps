import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {GoalMeasurement, GoalMeasurementService} from 'common';
import {DEMO_TAG, LIVA_SOURCE} from '../demo-patient.service';

const UCUM = 'http://unitsofmeasure.org';
const LOINC = 'http://loinc.org';
/** Blood pressure panel: LIVA sends systolic and diastolic as components */
const BP_PANEL = LOINC + '|85354-9';
/**
 * Units of the measures of the intervention catalogue whose goals have no target value (the goals then say what is
 * measured, not in which unit)
 */
const UNITS: Record<string, { unit: string, system: string, code: string }> = {
  [LOINC + '|41950-7']: {unit: 'steps/day', system: UCUM, code: '/d'},
  [LOINC + '|106724-8']: {unit: 'score', system: UCUM, code: '{score}'},
  [LOINC + '|29463-7']: {unit: 'kg', system: UCUM, code: 'kg'},
  [LOINC + '|8302-2']: {unit: 'cm', system: UCUM, code: 'cm'},
  [LOINC + '|93832-4']: {unit: 'h', system: UCUM, code: 'h'}
};

/** What LIVA can send for the accepted goals: GoalMeasurementService's measurements, and blood pressure (two values) */
interface LivaMeasurement extends Omit<GoalMeasurement, 'kind'> {
  kind: GoalMeasurement['kind'] | 'blood-pressure';
}

/**
 * Simulation of the LIVA coaching platform: the health coach sees the goals of the patient's active care plan, accepts
 * them (status active) and LIVA posts the patient's measurements (Observations with meta.source LIVA), which the
 * intervention plan of the risk-prediction app shows under the goals.
 */
@Component({
  selector: 'demo-liva-simulator',
  templateUrl: './liva-simulator.component.html'
})
export class LivaSimulatorComponent implements OnInit {
  @Input({required: true}) patientId!: string;
  @Input() patientName = '';
  /** the plan or its measurements changed */
  @Output() changed = new EventEmitter<void>();

  loading = true;
  error?: string;
  message?: string;
  busy = false;
  carePlan?: fhir4.CarePlan;
  goals: fhir4.Goal[] = [];
  measurements: LivaMeasurement[] = [];
  /** values being entered: measurement key -> value (number, or the code of a concept) */
  values: Record<string, any> = {};
  posted: fhir4.Observation[] = [];

  constructor(private sof: SmartOnFhirService) {}

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading = true;
    this.error = undefined;
    try {
      // as LIVA does: the active care plan with its goals (InterventionService.loadActiveCarePlan of risk-prediction)
      const [plans, observations] = await Promise.all([
        this.sof.search<any>('CarePlan', {status: 'active', patient: 'Patient/' + this.patientId, _sort: '-date', _count: 1, _include: '*'}),
        this.sof.search<fhir4.Observation>('Observation', {_source: LIVA_SOURCE, patient: 'Patient/' + this.patientId, _sort: '-date', _count: 20})
      ]);
      const resources = (plans.entry || []).map((e: fhir4.BundleEntry) => e.resource);
      this.carePlan = resources.find((r: any): r is fhir4.CarePlan => r?.resourceType === 'CarePlan');
      this.goals = resources.filter((r: any): r is fhir4.Goal => r?.resourceType === 'Goal');
      this.measurements = LivaSimulatorComponent.measurementsOf(this.goals.filter(g => this.accepted(g)));
      this.posted = (observations.entry || []).map(e => e.resource!).filter(r => r?.resourceType === 'Observation');
    } catch (err: any) {
      this.error = 'The care plan could not be loaded: ' + (err?.message || err);
    }
    this.loading = false;
  }

  /** The measurements of the goals with a target value, and of the goals that only name the measured code */
  static measurementsOf(goals: fhir4.Goal[]): LivaMeasurement[] {
    const measurements: LivaMeasurement[] = GoalMeasurementService.measurements(goals);
    for (const goal of goals) {
      for (const target of goal.target || []) {
        const coding = target.measure?.coding?.find(c => c.system && c.code);
        const key = coding && coding.system + '|' + coding.code;
        if (!coding || !key || measurements.some(m => m.key === key) || !(UNITS[key] || key === BP_PANEL)) {
          continue;
        }
        measurements.push({
          key, code: {coding: [coding]}, label: goal.description?.text || coding.display || key,
          kind: key === BP_PANEL ? 'blood-pressure' : 'quantity', unit: UNITS[key], targetConcepts: []
        });
      }
    }
    return measurements.sort((a, b) => a.label.localeCompare(b.label));
  }

  accepted(goal: fhir4.Goal): boolean {
    return ['accepted', 'active'].includes(goal.lifecycleStatus);
  }

  target(goal: fhir4.Goal): string {
    return (goal.target || []).map(t => GoalMeasurementService.targetText(t)).filter(Boolean).join(', ');
  }

  /** The health coach accepts the goal with the patient */
  async accept(goal: fhir4.Goal) {
    await this.run(async () => {
      const client = await this.sof.getClient();
      await client!.update(<any>{...goal, lifecycleStatus: 'active', statusDate: new Date().toISOString().slice(0, 10)});
      this.message = `Goal accepted: ${goal.description?.text || 'goal'}.`;
    });
  }

  async acceptAll() {
    await this.run(async () => {
      const client = await this.sof.getClient();
      const today = new Date().toISOString().slice(0, 10);
      for (const goal of this.goals.filter(g => g.lifecycleStatus === 'proposed')) {
        await client!.update(<any>{...goal, lifecycleStatus: 'active', statusDate: today});
      }
      this.message = 'All suggested goals accepted.';
    });
  }

  /** LIVA posts a measurement of the patient (e.g. from a device or the patient's diary) */
  async post(m: LivaMeasurement) {
    const value = this.values[m.key];
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (m.kind === 'blood-pressure' && !/^\s*\d+\s*\/\s*\d+\s*$/.test(value)) {
      this.message = 'Blood pressure as systolic/diastolic, e.g. 135/85.';
      return;
    }
    await this.run(async () => {
      const observation: fhir4.Observation = {
        resourceType: 'Observation',
        meta: {source: LIVA_SOURCE, tag: [DEMO_TAG]},
        status: 'final',
        code: m.code,
        subject: {reference: 'Patient/' + this.patientId},
        effectiveDateTime: new Date().toISOString(),
        ...(m.kind === 'blood-pressure' ? {component: LivaSimulatorComponent.bloodPressure(value)}
          : m.kind === 'quantity' ? {valueQuantity: {value: Number(value), ...(m.unit || {})}}
          : {valueCodeableConcept: {coding: [m.targetConcepts.find(c => c.code === value) || {code: value}]}})
      };
      await this.sof.create(observation);
      this.values[m.key] = undefined;
      this.message = `Measurement posted: ${m.label}.`;
    });
  }

  /** Systolic and diastolic components of a blood pressure panel, from "135/85" */
  static bloodPressure(value: string): fhir4.ObservationComponent[] {
    const [systolic, diastolic] = value.split('/').map(v => Number(v.trim()));
    const mmHg = {unit: 'mmHg', system: UCUM, code: 'mm[Hg]'};
    return [
      {code: {coding: [{system: LOINC, code: '8480-6', display: 'Systolic blood pressure'}]}, valueQuantity: {value: systolic, ...mmHg}},
      {code: {coding: [{system: LOINC, code: '8462-4', display: 'Diastolic blood pressure'}]}, valueQuantity: {value: diastolic, ...mmHg}}
    ];
  }

  private async run(action: () => Promise<void>) {
    this.busy = true;
    this.message = undefined;
    try {
      await action();
      await this.load();
      this.changed.emit();
    } catch (err: any) {
      this.message = 'Failed: ' + (err?.message || err);
    }
    this.busy = false;
  }

  hasProposed(): boolean {
    return this.goals.some(g => g.lifecycleStatus === 'proposed');
  }

  value(o: fhir4.Observation): string {
    if (o.component?.length) {
      return o.component.map(c => c.valueQuantity?.value).join('/') + ' ' + (o.component[0].valueQuantity?.unit || '');
    }
    return o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit || o.valueQuantity.code || ''}`
      : o.valueCodeableConcept?.coding?.[0]?.display || o.valueCodeableConcept?.coding?.[0]?.code || o.valueCodeableConcept?.text || '';
  }
}
