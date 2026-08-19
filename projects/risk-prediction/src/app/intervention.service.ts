import {Injectable} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {environment} from "../environments/environment";
import {v4} from "uuid";

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

  async loadRelatedMeasurements(patientId: string) {
    try {
      this.observationMap = {}
      this.observationNameMap = {}
      const observations = (await this.sof.search<fhir4.Observation>('Observation', {
        // TODO: update ng-smart-on-fhir to make selected client config public, then get the search params from the config
        _source: 'http://stage-healthyageing.eu/data-source/LIVA',
        subject: 'Patient/' + patientId
      }, {_sort: '-date', _count: 999}))?.entry?.map(_ => _.resource!) || [];
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
