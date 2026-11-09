import {Injectable} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {environment} from "../environments/environment";
import {v4} from "uuid";

/** Origin of a care plan activity added from another care plan (activities have no meta.source of their own) */
export const ACTIVITY_SOURCE_EXTENSION = 'http://stage-healthyaging.eu/fhir/StructureDefinition/activity-source';

@Injectable({
  providedIn: "root"
})
export class InterventionService {

  activeCarePlan?: fhir4.CarePlan;
  goals: fhir4.Goal[] = [];
  goalsByStatus: { [status: string]: fhir4.Goal[] } = {}
  carePlanLoading: boolean = false;
  carePlanLoadingError?: string;
  observationMap: { [code: string]: fhir4.Observation[] } = {};
  observationNameMap: { [code: string]: string } = {};

  constructor(private sof: SmartOnFhirService) {}

  async loadCarePlan(patientId: string) {
    this.carePlanLoading = true;
    this.carePlanLoadingError = undefined;
    try {
      const bundle = await this.sof.search<any>('CarePlan', {
        status: 'active',
        subject: 'Patient/' + patientId,
        _sort: '-date',
        _count: 1,
        _include: '*'
      });
      this.activeCarePlan = bundle?.entry?.find(entry => entry.resource?.resourceType === 'CarePlan')?.resource;
      this.goals = bundle?.entry?.filter(entry => entry.resource?.resourceType === 'Goal').map(entry => <fhir4.Goal>entry.resource) || [];
      this.goalsByStatus = {}
      this.goals.sort((g1, g2) => (g1.statusDate || '') > (g2.statusDate || '') ? -1 : 1)
      this.goals.forEach(goal => {
        if (!this.goalsByStatus[goal.lifecycleStatus]) {
          this.goalsByStatus[goal.lifecycleStatus] = []
        }
        this.goalsByStatus[goal.lifecycleStatus].push(goal);
      })
    } catch (err) {
      this.activeCarePlan = undefined;
      this.goals = [];
      this.goalsByStatus = {};
      this.carePlanLoadingError = err?.toString() || 'Failed to load the intervention plan.';
    }
    this.carePlanLoading = false;
    return this.activeCarePlan;
  }

  /**
   * Measurements shown with the plan: the observations of the LIVA data source, and the observations of the codes the
   * goals measure (e.g. recorded with "Add measurement")
   * @param codes - system|code of the goal measurements
   */
  async loadRelatedMeasurements(patientId: string, codes: string[] = []) {
    try {
      this.observationMap = {}
      this.observationNameMap = {}
      const [liva, measured] = await Promise.all([
        this.sof.search<fhir4.Observation>('Observation', {
          // TODO: update ng-smart-on-fhir to make selected client config public, then get the search params from the config
          _source: 'http://stage-healthyageing.eu/data-source/LIVA',
          subject: 'Patient/' + patientId
        }, {_sort: '-date', _count: 999}),
        codes.length ? this.sof.search<fhir4.Observation>('Observation', {
          code: codes.map(code => encodeURIComponent(code)).join(','),
          subject: 'Patient/' + patientId
        }, {_sort: '-date', _count: 999}).catch(err => {
          console.error(err);
          return undefined;
        }) : Promise.resolve(undefined)
      ]);
      const byId = new Map<string, fhir4.Observation>();
      [...(liva?.entry || []), ...(measured?.entry || [])].map(entry => entry.resource)
        .filter((resource): resource is fhir4.Observation => resource?.resourceType === 'Observation')
        .forEach(observation => byId.set(observation.id || Math.random().toString(), observation));
      const date = (observation: fhir4.Observation) => observation.effectiveDateTime || observation.effectivePeriod?.start || observation.issued || '';
      const observations = [...byId.values()].sort((a, b) => date(b).localeCompare(date(a)));
      observations.forEach(observation => {
        const code = observation.code.coding?.at(0)?.code || observation.code.text || '';
        const display = observation.code.coding?.at(0)?.display || observation.code.text || 'Unknown';
        if (!this.observationMap[code]) { this.observationMap[code] = []; }
        this.observationMap[code].push(observation)
        this.observationNameMap[code] = display;
      })
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Add the goals and activities of another care plan (e.g. one received from a clinician as a Smart Health Card) to a
   * care plan; the ones it has already are skipped. Activities described inline (activity.detail) get the source of the
   * other plan in ACTIVITY_SOURCE_EXTENSION, unless they tell their source already.
   * @return the merged care plan (not saved)
   */
  static mergeCarePlan(target: fhir4.CarePlan, other: fhir4.CarePlan): fhir4.CarePlan {
    const merged: fhir4.CarePlan = JSON.parse(JSON.stringify(target));
    const source = other.meta?.source;
    const goals = new Set((merged.goal || []).map(goal => goal.reference || goal.display));
    for (const goal of other.goal || []) {
      const key = goal.reference || goal.display;
      if (key && !goals.has(key)) {
        merged.goal = [...(merged.goal || []), goal];
        goals.add(key);
      }
    }
    const activities = new Set((merged.activity || []).map(activity => activity.reference?.reference || JSON.stringify(activity.detail || {})));
    for (const activity of other.activity || []) {
      const key = activity.reference?.reference || (activity.detail ? JSON.stringify(activity.detail) : undefined);
      if (!key || activities.has(key)) {
        continue;
      }
      const added: fhir4.CarePlanActivity = JSON.parse(JSON.stringify(activity));
      if (!added.reference?.reference && source && !added.extension?.some(extension => extension.url === ACTIVITY_SOURCE_EXTENSION)) {
        added.extension = [...(added.extension || []), {url: ACTIVITY_SOURCE_EXTENSION, valueUri: source}];
      }
      merged.activity = [...(merged.activity || []), added];
      activities.add(key);
    }
    return merged;
  }

  async createOrUpdateCarePlan(patientId: string, goals: fhir4.Goal[]) {
    if (!this.activeCarePlan) { await this.loadCarePlan(patientId) }
    const carePlan: fhir4.CarePlan = this.activeCarePlan || {
      resourceType: 'CarePlan',
      status: 'active',
      goal: [],
      id: v4(),
      intent: 'plan',
      subject: {
        reference: 'Patient/' + patientId
      },
      period: { start: new Date().toISOString() },
    }
    if (!carePlan.goal) { carePlan.goal = [] }
    carePlan.goal.push(...goals.map(goal => ({
      reference: 'Goal/' + (goal.id ? goal.id : (() => { throw new Error('Goal IDs should be set.') })())
    })))
    return await this.sof.transaction([carePlan, ...goals], 'PUT');
  }
}
