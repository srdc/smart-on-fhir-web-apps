import {Injectable} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {StoryboardService, StoryPatient} from './storyboard.service';

/**
 * Every resource the demonstrator writes carries this tag; the patient copies also have the session identifier.
 * scripts/cleanup_demo_copies.py deletes the copies (and everything that references them) after a while.
 */
export const DEMO_TAG: fhir4.Coding = {
  system: 'http://stage-healthyaging.eu/fhir/CodeSystem/demonstrator',
  code: 'demo-copy',
  display: 'Temporary data of the STAGE storyboard demonstrator'
};
/** Patient.identifier of a copy: the demonstrator session it was made in */
export const DEMO_SESSION_SYSTEM = 'http://stage-healthyaging.eu/fhir/demonstrator-session';
/** Patient.identifier of a copy: the storyboard patient it was copied from (the originals have .../storyboard-patient) */
export const DEMO_COPY_OF_SYSTEM = 'http://stage-healthyaging.eu/fhir/storyboard-patient-copy';
/** meta.source of the observations LIVA posts (see the interventions configuration of the login client) */
export const LIVA_SOURCE = 'http://stage-healthyageing.eu/data-source/LIVA';

/** A patient copy made in this browser */
export interface DemoCopy {
  /** Patient.id of the copy */
  patientId: string;
  /** storyboard patient it was copied from */
  storyId: string;
  /** session part of the ids */
  session: string;
  created: string;
  name: string;
  /** the name given to the copy, if not the storyboard patient's */
  given?: string;
  family?: string;
}

const STORAGE_KEY = 'STAGE_DEMONSTRATOR_COPIES';
/** the patient risk-prediction's per-browser state belongs to (resetAppStateFor) */
const APP_PATIENT_KEY = 'STAGE_DEMONSTRATOR_APP_PATIENT';

/**
 * Temporary copies of the storyboard patients: each visitor works on their own copy, so that the four storyboard patients
 * stay as described in the storyboard document whatever the visitors save (risk questionnaires, interventions, ...).
 */
@Injectable({providedIn: 'root'})
export class DemoPatientService {

  constructor(private sof: SmartOnFhirService, private storyboard: StoryboardService) {}

  /** The copies made in this browser, newest first */
  copies(): DemoCopy[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  copy(patientId: string): DemoCopy | undefined {
    return this.copies().find(c => c.patientId === patientId);
  }

  private saveCopies(copies: DemoCopy[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copies.slice(0, 20)));
    } catch { /* storage unavailable: the copy is only used in this page */ }
  }

  forget(patientId: string) {
    this.saveCopies(this.copies().filter(c => c.patientId !== patientId));
  }

  /** The copy of the patient, if it still exists on the server (copies are deleted after a while) */
  async read(copy: DemoCopy): Promise<fhir4.Patient | undefined> {
    const client = await this.sof.getClient();
    return client?.request<fhir4.Patient>('Patient/' + copy.patientId).catch(() => undefined);
  }

  /**
   * Copy a storyboard patient to the FHIR repository: new ids (session prefix), the demonstrator tag on every resource,
   * the session identifier, optionally another name, and the dates moved from the anchor date of the storyboard to today
   * (the birth date stays, so the patient stays in the model stratum of the story).
   */
  async create(story: StoryPatient, name?: { given?: string, family?: string }): Promise<DemoCopy> {
    const [storyboard, bundle] = await Promise.all([this.storyboard.load(), this.storyboard.bundle(story.id)]);
    const session = Math.random().toString(36).slice(2, 10);
    const prefix = `demo-${session}-`;
    const days = DemoPatientService.daysBetween(storyboard.anchor, new Date().toISOString().slice(0, 10));

    const ids = new Map<string, string>();
    bundle.entry?.forEach(entry => {
      const resource = entry.resource!;
      ids.set(resource.resourceType + '/' + resource.id, resource.resourceType + '/' + prefix + resource.id);
    });
    const patientId = ids.get('Patient/' + story.id)!.split('/')[1];
    const given = name?.given?.trim() || story.given;
    const family = name?.family?.trim() || story.family;

    const entries = bundle.entry!.map(entry => {
      const resource: any = DemoPatientService.rewrite(entry.resource, ids, days);
      resource.id = prefix + entry.resource!.id;
      resource.meta = {...(resource.meta || {}), tag: [...(resource.meta?.tag || []), DEMO_TAG]};
      if (resource.resourceType === 'Patient') {
        resource.name = [{use: 'official', family, given: [given]}];
        resource.identifier = [
          {system: DEMO_SESSION_SYSTEM, value: session},
          {system: DEMO_COPY_OF_SYSTEM, value: story.id}
        ];
      }
      const reference = resource.resourceType + '/' + resource.id;
      return {fullUrl: reference, resource, request: {method: 'PUT', url: reference}};
    });
    await this.sof.transaction(<any>{resourceType: 'Bundle', type: 'transaction', entry: entries});

    const copy: DemoCopy = {patientId, storyId: story.id, session, created: new Date().toISOString(), name: `${given} ${family}`,
      ...(given !== story.given ? {given} : {}), ...(family !== story.family ? {family} : {})};
    this.saveCopies([copy, ...this.copies().filter(c => c.patientId !== patientId)]);
    return copy;
  }

  /** Make the copy the patient of the SMART session (shared with the risk-prediction app in the frame) */
  async select(copy: DemoCopy): Promise<fhir4.Patient | undefined> {
    const patient = await this.read(copy);
    if (patient) {
      this.sof.selectPatient(patient);
    }
    return patient;
  }

  /**
   * Clear what risk-prediction keeps in the browser for the last patient, not per patient (the last disease selection,
   * results, saved risk questionnaire, chatbot session), when the story opens another patient: otherwise the app shows
   * the results and selection of the previous patient.
   */
  static resetAppStateFor(patientId: string) {
    try {
      if (localStorage.getItem(APP_PATIENT_KEY) === patientId) {
        return;
      }
      ['questionnaire_results', 'risk_prediction_selected_diseases'].forEach(k => localStorage.removeItem(k));
      ['risk_prediction_qr', 'llm_session_id'].forEach(k => sessionStorage.removeItem(k));
      localStorage.setItem(APP_PATIENT_KEY, patientId);
    } catch { /* storage unavailable */ }
  }

  /**
   * Let the apps in frames continue with the SMART session: fhirclient's ready() in a frame takes the session for an
   * authorization to complete in the parent (it posts "completeAuth" to the parent and never resolves), unless its state
   * says the authorization completes in the target (completeInTarget).
   */
  static allowSessionInFrames() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const key = JSON.parse(storage.getItem('SMART_KEY') || 'null');
        const state = key && JSON.parse(storage.getItem(key) || 'null');
        if (state && !state.completeInTarget) {
          storage.setItem(key, JSON.stringify({...state, completeInTarget: true}));
        }
      } catch { /* no session in this storage */ }
    }
  }

  /** References to the copied resources, and the dates moved by the given number of days (except birth dates) */
  private static rewrite(value: any, ids: Map<string, string>, days: number, key?: string): any {
    if (Array.isArray(value)) {
      return value.map(v => DemoPatientService.rewrite(v, ids, days));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, DemoPatientService.rewrite(v, ids, days, k)]));
    }
    if (typeof value === 'string') {
      if (key === 'reference') {
        return ids.get(value) || value;
      }
      if (key !== 'birthDate' && days && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return DemoPatientService.shiftDate(value, days);
      }
    }
    return value;
  }

  /** Move a FHIR date/dateTime/instant by whole days, keeping its time and offset as written */
  static shiftDate(value: string, days: number): string {
    const date = new Date(value.slice(0, 10) + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10) + value.slice(10);
  }

  static daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
  }
}
