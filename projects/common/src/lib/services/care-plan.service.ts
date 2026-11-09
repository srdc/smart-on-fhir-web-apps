import {Injectable} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';

/** Goal lifecycle statuses that end a goal: a new target for the same code becomes a new goal */
const CLOSED_GOAL_STATUSES = ['completed', 'cancelled', 'rejected', 'entered-in-error'];

export interface SavedGoals {
  carePlan: fhir4.CarePlan;
  /** Goals added to the care plan */
  created: fhir4.Goal[];
  /** Open goals of the care plan with the same code, whose target was replaced */
  updated: fhir4.Goal[];
  /** Whether the care plan was created (there was no active one) */
  carePlanCreated: boolean;
}

/**
 * The patient's active care plan and its goals on the FHIR server
 * (the same model as risk-prediction's intervention plan: one active CarePlan referencing Goals)
 */
@Injectable({
  providedIn: 'root'
})
export class CarePlanService {

  constructor(private sof: SmartOnFhirService) {
  }

  /** Whether goals can be saved: a patient on a FHIR server (not a standalone or an imported SHC session) */
  async canSave(): Promise<boolean> {
    const client = await Promise.resolve(this.sof.getClient()).catch(() => undefined);
    const patient = await this.sof.getPatient().catch(() => undefined);
    return !!client?.state?.serverUrl && !!patient?.id && patient.id !== 'standalone';
  }

  /** The patient's latest active CarePlan with its goals */
  async findActiveCarePlan(patientId: string): Promise<{ carePlan?: fhir4.CarePlan, goals: fhir4.Goal[] }> {
    const bundle = await this.sof.search<fhir4.Resource>('CarePlan', {
      subject: 'Patient/' + patientId,
      status: 'active',
      _sort: '-date',
      _count: 1,
      _include: '*'
    });
    const resources = (bundle.entry || []).map(entry => entry.resource).filter((resource): resource is fhir4.Resource => !!resource);
    const carePlan = <fhir4.CarePlan | undefined>resources.find(resource => resource.resourceType === 'CarePlan');
    const goalRefs = new Set((carePlan?.goal || []).map(ref => ref.reference?.split('/').slice(-2).join('/')));
    const goals = <fhir4.Goal[]>resources.filter(resource => resource.resourceType === 'Goal' && goalRefs.has('Goal/' + resource.id));
    return {carePlan, goals};
  }

  /**
   * A goal reaching the value of an observation: its code is the goal description and target measure,
   * its valueQuantity the target detailQuantity
   */
  static goalFromObservation(patientId: string, observation: fhir4.Observation,
                             lifecycleStatus: fhir4.Goal['lifecycleStatus'] = 'active'): fhir4.Goal {
    const today = new Date().toISOString().split('T')[0];
    const code: fhir4.CodeableConcept = JSON.parse(JSON.stringify(observation.code));
    return {
      resourceType: 'Goal',
      lifecycleStatus,
      statusDate: today,
      description: code,
      subject: {reference: 'Patient/' + patientId},
      startDate: today,
      target: [{
        measure: JSON.parse(JSON.stringify(code)),
        ...(observation.valueQuantity ? {detailQuantity: {...observation.valueQuantity}} :
            (observation.valueCodeableConcept ? {detailCodeableConcept: {...observation.valueCodeableConcept}} : {})
        )
      }]
    };
  }

  /**
   * Add goals to the patient's active care plan, creating the care plan when there is none.
   * An open goal of the care plan with the same code gets the new target instead of a duplicate goal.
   * Everything is written in one transaction.
   */
  async saveGoals(patientId: string, goals: fhir4.Goal[]): Promise<SavedGoals> {
    const {carePlan: existing, goals: existingGoals} = await this.findActiveCarePlan(patientId);
    const carePlan: fhir4.CarePlan = existing ? {...existing} : {
      resourceType: 'CarePlan',
      id: crypto.randomUUID(),
      status: 'active',
      intent: 'plan',
      subject: {reference: 'Patient/' + patientId},
      period: {start: new Date().toISOString()},
      created: new Date().toISOString()
    };
    carePlan.goal = [...(carePlan.goal || [])];
    const created: fhir4.Goal[] = [];
    const updated: fhir4.Goal[] = [];
    goals.forEach(goal => {
      const codes = CarePlanService.codes(goal);
      const open = [...existingGoals, ...created].find(other =>
        !CLOSED_GOAL_STATUSES.includes(other.lifecycleStatus) && CarePlanService.codes(other).some(code => codes.includes(code)));
      if (open) {
        open.target = goal.target;
        open.statusDate = goal.statusDate;
        if (!updated.includes(open) && !created.includes(open)) updated.push(open);
      } else {
        const added = {...goal, id: goal.id || crypto.randomUUID()};
        created.push(added);
        carePlan.goal!.push({reference: 'Goal/' + added.id});
      }
    });
    await this.sof.transaction([carePlan, ...created, ...updated], 'PUT');
    return {carePlan, created, updated, carePlanCreated: !existing};
  }

  /** system|code of the goal's description and target measures */
  private static codes(goal: fhir4.Goal): string[] {
    return [goal.description, ...(goal.target || []).map(target => target.measure)]
      .flatMap(concept => concept?.coding || [])
      .filter(coding => !!coding.code)
      .map(coding => (coding.system || '') + '|' + coding.code);
  }
}
