import {InjectionToken} from '@angular/core';

/**
 * Settings for sharing patient data as SMART Health Cards / SMART Health Links.
 * Provided by SmartCdsCommonModule.forRoot() from `environment.smart`.
 */
export interface HealthCardConfig {
  /**
   * Base URL of the SMART Health Links server (POST {shlServerBaseUrl}/shl/create).
   * Without it, issued cards can only be downloaded as .smart-health-card files.
   */
  shlServerBaseUrl?: string;
  /**
   * SHL server per FHIR server (FHIR base URL of the login client → SHL server base URL), e.g. one SHL server per EHR.
   * FHIR servers not listed use shlServerBaseUrl.
   */
  shlServerBaseUrls?: { [fhirBaseUrl: string]: string };
  /**
   * Send the SMART app's access token to the SHL server when creating links, so that the server binds them to the user
   * (needs SHL_OWNER_JWKS_URL on the server). The user can then list and revoke their links with their account, e.g.
   * after forgetting the password of the link vault. Only enable it for an SHL server you trust with the access token.
   */
  shlOwnerAuth?: boolean;
  /**
   * Canonical base of the ValueSets made for the CDS health card profiles ('<base>shc-<service>'), e.g.
   * 'http://stage-healthyaging.eu/fhir/ValueSet/' to use the ones a repository already holds (stage-fhir-repository
   * fhir-conf/valueset). Default: '<CDS base URL>/ValueSet/'.
   */
  healthCardValueSetBaseUrl?: string;
  /** Minutes of inactivity after which the encrypted link vault locks itself (default 10) */
  linkVaultAutoLockMinutes?: number;
  /** Built-in health card profiles offered by HealthCardProfileService (all enabled by default) */
  healthCardProfiles?: {
    /** International Patient Summary */
    ips?: boolean;
    /** One profile per CDS service that publishes concept definitions; `exclude` lists CDS service ids to leave out */
    cds?: boolean | { exclude?: string[] };
    /**
     * The patient's active care plan (off by default: a care plan page offers it on its own through
     * CarePlanHealthCardProfileProvider); true adds it to the profiles of every page
     */
    carePlan?: boolean;
    /** Cards the patient received and imported into the record, shared again unchanged (on by default) */
    imported?: boolean;
    /** Cards the patient received and keeps in the link vault (Shared Links), shared again unchanged (on by default) */
    received?: boolean;
  };
}

export const HEALTH_CARD_CONFIG = new InjectionToken<HealthCardConfig>('HEALTH_CARD_CONFIG');
