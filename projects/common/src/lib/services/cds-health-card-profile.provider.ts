import {Inject, Injectable, Optional} from '@angular/core';
import {CdsHooksService, CdsHooksServiceConfig} from 'cds-hooks';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {DEFAULT_IDENTITY_CLAIMS, HealthCardProfile, HealthCardProfileProvider, HealthCardRequirement} from './health-card-profile';
import {HEALTH_CARD_CONFIG, HealthCardConfig} from './health-card.config';
import {SmartHealthCardService} from './smart-health-card.service';
import {CdsUtils} from '../utils/cds-utils';

/** A concept of the 'definition' CDS service response (only the fields used here) */
interface ConceptDefinition {
  resourceType?: string;
  type?: string;
  label?: string;
  /** Default code of the concept */
  code?: fhir4.Coding;
  /** Selectable codes of the concept, or answer options for CodeableConcept concepts */
  select?: fhir4.Coding[];
}

/** CDS services that provide infrastructure, not decision support */
const UTILITY_SERVICES = ['definition', 'valueset', 'in-memory-search'];
/** Search parameter holding the code filter per resource type */
const CODE_PARAMS: { [resourceType: string]: string } = {Immunization: 'vaccine-code'};

/**
 * Health card profiles for the CDS services of the configured CDS Hooks server: a card holds the data a CDS service fetches,
 * so the CDS app can run on it after importing the card (SMART Health Card / Link login).
 *
 * For each service that publishes concept definitions (the 'definition' service), every concept becomes a requirement:
 * its resource type, and the codes of its prefetch query (the definition's codes when the query has no resolved code filter).
 * The profile is issued as a single card: all code filtered resource types in one $health-cards-issue call, filtered by one
 * ValueSet (saved on the FHIR server) holding the codes of all of them. Only resource types fetched without a code filter
 * (every resource of the type) need a second card, as a credentialValueSet applies to all requested types.
 */
@Injectable()
export class CdsHealthCardProfileProvider implements HealthCardProfileProvider {

  private loaded: Promise<HealthCardProfile[]> | undefined;
  private readonly exclude: Set<string>;
  private readonly valueSetBaseUrl: string;

  constructor(private cds: CdsHooksService<fhir4.Resource>, private sof: SmartOnFhirService, private healthCards: SmartHealthCardService,
              @Inject('cdsConfig') cdsConfig: CdsHooksServiceConfig<fhir4.Resource>,
              @Optional() @Inject(HEALTH_CARD_CONFIG) config?: HealthCardConfig) {
    const cdsProfiles = config?.healthCardProfiles?.cds;
    this.exclude = new Set([...UTILITY_SERVICES, ...(typeof cdsProfiles === 'object' ? cdsProfiles.exclude || [] : [])]);
    this.valueSetBaseUrl = config?.healthCardValueSetBaseUrl
      ? config.healthCardValueSetBaseUrl.replace(/\/*$/, '/')
      : cdsConfig.baseUrl.replace(/\/+$/, '') + '/ValueSet/';
  }

  profiles(): Promise<HealthCardProfile[]> {
    if (!this.loaded) {
      this.loaded = this.load().catch(err => {
        this.loaded = undefined; // retry on the next call
        throw err;
      });
    }
    return this.loaded;
  }

  private async load(): Promise<HealthCardProfile[]> {
    const serviceIds = (await this.cds.listServices()).filter(serviceId => !this.exclude.has(serviceId));
    const profiles = await Promise.all(serviceIds.map(serviceId => this.createProfile(serviceId).catch(err => {
      console.warn(`Health card profile of the CDS service '${serviceId}' could not be created`, err);
      return undefined;
    })));
    return profiles.filter((profile): profile is HealthCardProfile => !!profile);
  }

  private async createProfile(serviceId: string): Promise<HealthCardProfile | undefined> {
    const service = await this.cds.getServiceDefinition(serviceId);
    const prefetch: { [key: string]: string } = service?.prefetch || {};
    if (!service || !Object.values(prefetch).some(query => !CdsHealthCardProfileProvider.isPatientRead(query))) {
      return undefined; // no clinical data fetched
    }
    const response = await this.cds.callService({serviceId: 'definition', context: {serviceId}, prefetch: {}});
    const detail = response?.cards?.at(0)?.detail;
    const concepts: { [conceptId: string]: ConceptDefinition } = detail ? CdsUtils.parseCardDetail(detail) : {};
    const requirements = CdsHealthCardProfileProvider.requirements(concepts, prefetch);
    if (!requirements.length) {
      return undefined; // the service publishes no concept definitions
    }
    const label = service.title || serviceId;
    return {
      id: 'cds:' + serviceId,
      label,
      description: service.description || undefined,
      source: 'CDS',
      signed: true,
      requirements,
      issue: async patientId => ({verifiableCredentials: await this.issue(serviceId, label, requirements, patientId)})
    };
  }

  /**
   * One card for the code filtered resource types (one ValueSet with all their codes), plus one card for the resource types
   * fetched without a code filter, if any
   */
  private async issue(serviceId: string, label: string, requirements: HealthCardRequirement[], patientId: string): Promise<string[]> {
    const filtered = requirements.filter(requirement => requirement.codes.length);
    const unfiltered = requirements.filter(requirement => !requirement.codes.length);
    const cards = await Promise.all([
      filtered.length ? this.saveValueSet(serviceId, label, filtered.flatMap(requirement => requirement.codes)).then(valueSetUrl =>
        this.healthCards.issue(patientId, {
          credentialType: filtered.map(requirement => requirement.resourceType),
          credentialValueSet: [valueSetUrl],
          includeIdentityClaim: DEFAULT_IDENTITY_CLAIMS
        })) : Promise.resolve([]),
      unfiltered.length ? this.healthCards.issue(patientId, {
        credentialType: unfiltered.map(requirement => requirement.resourceType),
        includeIdentityClaim: DEFAULT_IDENTITY_CLAIMS
      }) : Promise.resolve([])
    ]);
    return cards.flat();
  }

  /** Create or update the ValueSet the issuer uses to filter the profile's resources; returns its canonical URL */
  private async saveValueSet(serviceId: string, label: string, codes: fhir4.Coding[]): Promise<string> {
    const id = ('shc-' + serviceId).toLowerCase().replace(/[^a-z0-9\-.]/g, '-').substring(0, 64);
    const url = this.valueSetBaseUrl + id;
    const unique = [...new Map(codes.map(coding => [coding.system + '|' + coding.code, coding])).values()];
    const include = Object.entries(unique.reduce((systems, coding) => {
      (systems[coding.system!] = systems[coding.system!] || []).push(coding.display ? {code: coding.code!, display: coding.display} : {code: coding.code!});
      return systems;
    }, <{ [system: string]: fhir4.ValueSetComposeIncludeConcept[] }>{})).map(([system, concept]) => ({system, concept}));
    const valueSet: fhir4.ValueSet = {
      resourceType: 'ValueSet',
      id,
      url,
      name: id.replace(/[^A-Za-z0-9]/g, '_'),
      title: `${label} - codes for Smart Health Cards`,
      status: 'active',
      compose: {include}
    };
    const existing = await this.sof.search<fhir4.ValueSet>('ValueSet', {url})
      .then(bundle => <fhir4.ValueSet | undefined>bundle.entry?.find(entry => entry.resource?.resourceType === 'ValueSet')?.resource)
      .catch(() => undefined);
    if (!existing || CdsHealthCardProfileProvider.codeKeys(existing) !== CdsHealthCardProfileProvider.codeKeys(valueSet)) {
      await this.sof.create<fhir4.ValueSet>(valueSet, existing?.id || id);
    }
    return url;
  }

  /**
   * Requirements of a CDS service: for each concept definition, its resource type and the codes of its prefetch query,
   * or the definition's codes when the query has no resolved code filter; merged per resource type
   */
  static requirements(concepts: { [conceptId: string]: ConceptDefinition }, prefetch: { [key: string]: string }): HealthCardRequirement[] {
    const byType = new Map<string, Map<string, fhir4.Coding> | 'all'>();
    Object.entries(concepts || {}).forEach(([conceptId, concept]) => {
      const query = prefetch[conceptId];
      const resourceType = concept?.resourceType || (query ? CdsHealthCardProfileProvider.queryResourceType(query) : undefined);
      if (!resourceType || resourceType === 'Patient') {
        return; // the patient is always put in the card
      }
      const filter = query ? CdsHealthCardProfileProvider.queryCodes(query, resourceType) : 'unresolved';
      const codes = filter === 'unresolved' ? CdsHealthCardProfileProvider.definitionCodes(concept) : filter;
      if (codes !== 'all' && !codes.length) {
        console.warn(`No codes found for the concept '${conceptId}'; it is left out of the health card.`);
        return;
      }
      const current = byType.get(resourceType);
      if (codes === 'all' || current === 'all') {
        byType.set(resourceType, 'all'); // a concept fetching every resource of the type
      } else {
        const merged = current || new Map<string, fhir4.Coding>();
        codes.forEach(coding => merged.set(coding.system + '|' + coding.code, coding));
        byType.set(resourceType, merged);
      }
    });
    return [...byType].map(([resourceType, codes]) => ({resourceType, codes: codes === 'all' ? [] : [...codes.values()]}));
  }

  /** Codes of the query's code filter: 'all' without a code filter, 'unresolved' when it still has a {{placeholder}} or no value */
  static queryCodes(query: string, resourceType: string): fhir4.Coding[] | 'all' | 'unresolved' {
    const codeParam = CODE_PARAMS[resourceType] || 'code';
    const values = (query.split('?')[1] || '').split('&')
      .map(param => param.split('='))
      .filter(([name]) => name === codeParam)
      .map(([, value]) => decodeURIComponent(value || ''));
    if (!values.length) {
      return 'all';
    }
    if (values.some(value => !value.trim() || value.includes('{{'))) {
      return 'unresolved';
    }
    const codes = values.flatMap(value => value.split(','))
      .map(token => token.split('|'))
      .filter(parts => parts.length === 2 && !!parts[0] && !!parts[1])
      .map(([system, code]) => ({system, code}));
    return codes.length ? codes : 'unresolved';
  }

  /** The concept's default code, plus its selectable codes unless they are answer options (CodeableConcept concepts) */
  static definitionCodes(concept: ConceptDefinition): fhir4.Coding[] {
    return [concept.code, ...(concept.type !== 'CodeableConcept' && Array.isArray(concept.select) ? concept.select : [])]
      .filter((coding): coding is fhir4.Coding => !!coding?.system && !!coding?.code)
      .map(coding => coding.display ? {system: coding.system, code: coding.code, display: coding.display} : {system: coding.system, code: coding.code});
  }

  private static queryResourceType(query: string): string | undefined {
    return query.split('?')[0].split('/')[0] || undefined;
  }

  private static isPatientRead(query: string): boolean {
    return /^Patient(\/|\?|$)/.test(query);
  }

  private static codeKeys(valueSet: fhir4.ValueSet): string {
    return (valueSet.compose?.include || [])
      .flatMap(include => (include.concept || []).map(concept => include.system + '|' + concept.code)).sort().join(',');
  }
}
