import {InjectionToken} from '@angular/core';
import {SharedContent} from './shl-api.service';

/** Data a card must contain: resources of a type, optionally limited to some codes */
export interface HealthCardRequirement {
  resourceType: string;
  /** Codes the resources must have; empty means every resource of the type */
  codes: fhir4.Coding[];
}

/**
 * A kind of SMART Health Card the UI can offer, e.g. the IPS, or the data a CDS service needs
 * (so that the card can be imported by the CDS app — the SHC consumer scenario)
 */
export interface HealthCardProfile {
  /** Unique id, e.g. 'ips', 'cds:qrisk3' */
  id: string;
  label: string;
  description?: string;
  /** Where the profile comes from, e.g. 'IPS', 'CDS' */
  source: string;
  /** Informative: the data the card(s) contain */
  requirements?: HealthCardRequirement[];
  /** Whether the content is signed (SMART Health Cards) or shared as plain FHIR (application/fhir+json) */
  signed: boolean;
  /**
   * Prepare the content for the given patient: issued cards (compact JWS) and/or FHIR resources
   * @return empty lists if there is no matching data
   */
  issue(patientId: string): Promise<SharedContent>;
}

/** Supplies health card profiles; register implementations with `{provide: HEALTH_CARD_PROFILE_PROVIDERS, useClass: ..., multi: true}` */
export interface HealthCardProfileProvider {
  profiles(): Promise<HealthCardProfile[]>;
  /** Whether the profiles need the FHIR server's $health-cards-issue (default true); cards shared as received do not */
  readonly requiresIssueOperation?: boolean;
}

export const HEALTH_CARD_PROFILE_PROVIDERS = new InjectionToken<HealthCardProfileProvider[]>('HEALTH_CARD_PROFILE_PROVIDERS');

/** Patient elements put in issued cards besides the clinical data: CDS algorithms need gender and age (e.g. for risk scores) */
export const DEFAULT_IDENTITY_CLAIMS = ['Patient.name', 'Patient.birthDate', 'Patient.gender'];
