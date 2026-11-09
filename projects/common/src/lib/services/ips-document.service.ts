import {Injectable} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {SmartHealthCardService} from './smart-health-card.service';
import {FileUtils} from '../utils/file-utils';

/** Patient data that goes into the IPS sections */
export interface IpsContent {
  conditions: fhir4.Condition[];
  medications: fhir4.MedicationStatement[];
  allergies: fhir4.AllergyIntolerance[];
  immunizations: fhir4.Immunization[];
  labResults: fhir4.Observation[];
  vitalSigns: fhir4.Observation[];
  procedures: fhir4.Procedure[];
  devices: fhir4.DeviceUseStatement[];
}

/** An International Patient Summary: the Composition and the document Bundle built around it */
export interface IpsDocument {
  composition: fhir4.Composition;
  bundle: fhir4.Bundle<fhir4.Resource>;
  content: IpsContent;
  /**
   * "No information" entries of the required sections without data (absent-unknown-uv-ips codes), only in the document
   * Bundle: they are not stored on the FHIR server
   */
  placeholders?: fhir4.Resource[];
}

interface IpsSectionDefinition {
  key: keyof IpsContent;
  title: string;
  code: fhir4.Coding;
  /**
   * Problems, Allergies and Medications are required IPS sections, Procedures and Medical Devices are also required by the EU
   * Patient Summary (EPS): when empty they get a "no information" entry (no emptyReason allowed there, an entry is required);
   * other empty sections are left out
   */
  required: boolean;
}

type FhirClient = NonNullable<Awaited<ReturnType<SmartOnFhirService['getClient']>>>;

const LOINC = 'http://loinc.org';
/** IPS codes for absent or unknown information (no-allergy-info, no-problem-info, no-medication-info...) */
const ABSENT_UNKNOWN = 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips';
const IPS_SECTIONS: IpsSectionDefinition[] = [
  {key: 'conditions', title: 'Active Problems', required: true, code: {system: LOINC, code: '11450-4', display: 'Problem list Reported'}},
  {key: 'medications', title: 'Medications', required: true, code: {system: LOINC, code: '10160-0', display: 'History of Medication use Narrative'}},
  {key: 'allergies', title: 'Allergies and Intolerances', required: true, code: {system: LOINC, code: '48765-2', display: 'Allergies and adverse reactions Document'}},
  {key: 'procedures', title: 'History of Procedures', required: true, code: {system: LOINC, code: '47519-4', display: 'History of Procedures Document'}},
  {key: 'devices', title: 'Medical Devices', required: true, code: {system: LOINC, code: '46264-8', display: 'History of medical device use'}},
  {key: 'immunizations', title: 'Immunizations', required: false, code: {system: LOINC, code: '11369-6', display: 'History of Immunization note'}},
  {key: 'labResults', title: 'Results', required: false, code: {system: LOINC, code: '30954-2', display: 'Relevant diagnostic tests/laboratory data note'}},
  {key: 'vitalSigns', title: 'Vital Signs', required: false, code: {system: LOINC, code: '8716-3', display: 'Vital signs note'}}
];
/** Resource types referenced from the entries (performer, asserter, ...) that are added to the document so the references resolve */
const PARTICIPANT_TYPES = ['Practitioner', 'PractitionerRole', 'Organization'];

/**
 * Builds International Patient Summary (IPS) documents for the current patient: collects the data, builds the Composition and
 * the document Bundle, downloads it, or issues it as a SMART Health Card via $health-cards-issue.
 */
@Injectable({
  providedIn: 'root'
})
export class IpsDocumentService {

  static readonly COMPOSITION_TYPE = {system: LOINC, code: '60591-5', display: 'Patient Summary Document'};
  /** credentialType the issuer uses for an IPS card */
  static readonly CREDENTIAL_TYPE = '#ips';

  constructor(private sof: SmartOnFhirService, private healthCards: SmartHealthCardService) {
  }

  /** Collect the data and build the IPS document of the given patient */
  async generate(patient: fhir4.Patient): Promise<IpsDocument> {
    if (!patient.id) {
      throw new Error('Patient id is required to build an IPS.');
    }
    return this.build(patient, await this.collect(patient.id));
  }

  /**
   * Collect the patient's IPS data: the latest resource per code via the onFHIR $distinct-pages operation,
   * or plain searches when the server does not support it. Entered-in-error records and observations without a result are left out.
   */
  async collect(patientId: string): Promise<IpsContent> {
    const subject = 'Patient/' + patientId;
    const distinctPages = async <T extends fhir4.Resource>(resourceType: string, codePath: string, dateParam: string, category?: string): Promise<T[]> =>
      IpsDocumentService.resources(await this.sof.operation<fhir4.Bundle<T>>({
        operationName: 'distinct-pages',
        resourceType,
        queryParams: [{codePath, subject, dateParam, _count: 999}],
        params: category ? {
          resourceType: 'Parameters',
          parameter: [{
            name: 'queryParams',
            resource: {resourceType: 'Parameters', parameter: [{name: 'category', valueString: category}]}
          }]
        } : undefined
      }));
    const search = async <T extends fhir4.Resource>(resourceType: string, params: { [key: string]: string }): Promise<T[]> =>
      IpsDocumentService.resources(await this.sof.search<T>(resourceType, params));
    // sections the server may not support (e.g. no DeviceUseStatement): empty, so they get a "no information" entry
    const optionalSearch = <T extends fhir4.Resource>(resourceType: string, params: { [key: string]: string }): Promise<T[]> =>
      search<T>(resourceType, params).catch(err => {
        console.warn(`${resourceType} resources could not be searched for the IPS`, err);
        return [];
      });
    const [procedures, devices] = await Promise.all([
      optionalSearch<fhir4.Procedure>('Procedure', {subject}),
      optionalSearch<fhir4.DeviceUseStatement>('DeviceUseStatement', {subject})
    ]);

    let content: IpsContent;
    try {
      const [conditions, medications, allergies, immunizations, labResults, vitalSigns] = await Promise.all([
        distinctPages<fhir4.Condition>('Condition', 'code.coding.code', 'onset-date'),
        distinctPages<fhir4.MedicationStatement>('MedicationStatement', 'medicationCodeableConcept.coding.code', 'effective'),
        distinctPages<fhir4.AllergyIntolerance>('AllergyIntolerance', 'code.coding.code', 'date'),
        distinctPages<fhir4.Immunization>('Immunization', 'vaccineCode.coding.code', 'date'),
        distinctPages<fhir4.Observation>('Observation', 'code.coding.code', 'date', 'laboratory'),
        distinctPages<fhir4.Observation>('Observation', 'code.coding.code', 'date', 'vital-signs')
      ]);
      content = {conditions, medications, allergies, immunizations, labResults, vitalSigns, procedures, devices};
    } catch (err: any) {
      if (err?.status !== 404) {
        throw err;
      }
      // $distinct-pages is an onFHIR operation; other servers get plain searches
      const [conditions, medications, allergies, immunizations, labResults, vitalSigns] = await Promise.all([
        search<fhir4.Condition>('Condition', {subject}),
        search<fhir4.MedicationStatement>('MedicationStatement', {subject}),
        search<fhir4.AllergyIntolerance>('AllergyIntolerance', {patient: subject}),
        search<fhir4.Immunization>('Immunization', {patient: subject}),
        search<fhir4.Observation>('Observation', {category: 'laboratory', subject}),
        search<fhir4.Observation>('Observation', {category: 'vital-signs', subject})
      ]);
      content = {conditions, medications, allergies, immunizations, labResults, vitalSigns, procedures, devices};
    }
    return IpsDocumentService.filterContent(content);
  }

  /** Drop what does not belong in a patient summary */
  static filterContent(content: IpsContent): IpsContent {
    const notInError = (resource: any) => resource.status !== 'entered-in-error'
      && !resource.verificationStatus?.coding?.some((coding: fhir4.Coding) => coding.code === 'entered-in-error');
    // Observation must carry a result (IPS ips-2, vital signs vs-2)
    const hasResult = (observation: fhir4.Observation) => Object.keys(observation).some(key => key.startsWith('value'))
      || !!observation.component?.length || !!observation.hasMember?.length || !!observation.dataAbsentReason;
    const isLoinc = (observation: fhir4.Observation) => !!observation.code?.coding?.some(coding => coding.system === LOINC);
    return {
      conditions: content.conditions.filter(notInError),
      medications: content.medications.filter(notInError),
      allergies: content.allergies.filter(notInError),
      immunizations: content.immunizations.filter(notInError),
      labResults: content.labResults.filter(observation => notInError(observation) && hasResult(observation)),
      vitalSigns: content.vitalSigns.filter(observation => notInError(observation) && hasResult(observation) && isLoinc(observation)),
      procedures: (content.procedures || []).filter(notInError),
      devices: (content.devices || []).filter(notInError)
    };
  }

  /**
   * Build the IPS Composition and document Bundle. The latest IPS Composition of the patient is reused (same id), so saving it
   * before issuing a card updates it. Every entry gets an absolute fullUrl on the FHIR server, so the relative references resolve.
   */
  async build(patient: fhir4.Patient, content: IpsContent): Promise<IpsDocument> {
    const client = await this.sof.getClient();
    const serverUrl = client?.state.serverUrl;
    if (!client || !serverUrl || !patient.id) {
      throw new Error('An IPS can only be built for a patient on a FHIR server.');
    }
    const baseUrl = serverUrl.replace(/\/?$/, '/');
    const patientRef = 'Patient/' + patient.id;
    const now = new Date().toISOString();

    const existing = await this.sof.search<fhir4.Composition>('Composition', {
      subject: patientRef,
      type: IpsDocumentService.COMPOSITION_TYPE.system + '|' + IpsDocumentService.COMPOSITION_TYPE.code,
      _sort: '-date',
      _count: 1
    }).then(bundle => IpsDocumentService.resources(bundle).find(resource => resource.resourceType === 'Composition'))
      .catch(() => undefined);
    const author = await this.resolveAuthor(client, patient);

    // required sections without data: an entry saying there is no information (IPS 1.1/EPS: entry 1..*, no emptyReason)
    const placeholders: fhir4.Resource[] = [];
    const sectionResources = (definition: IpsSectionDefinition): fhir4.Resource[] => {
      const resources: fhir4.Resource[] = content[definition.key] || [];
      // the entry first, then the resources it refers to (e.g. the Device of a DeviceUseStatement)
      const placeholder = !resources.length && definition.required ? IpsDocumentService.noInformation(definition.key, patientRef) : [];
      if (placeholder.length) {
        placeholders.push(...placeholder);
        return [placeholder[0]];
      }
      return resources;
    };

    const composition: fhir4.Composition = {
      ...(existing || {}),
      resourceType: 'Composition',
      id: existing?.id || IpsDocumentService.uuid(),
      // required by the EU Patient Summary (EPS)
      identifier: existing?.identifier || {system: 'urn:ietf:rfc:3986', value: 'urn:uuid:' + IpsDocumentService.uuid()},
      status: 'final',
      type: {coding: [IpsDocumentService.COMPOSITION_TYPE]},
      subject: {reference: patientRef},
      date: now,
      author: [author.reference],
      title: existing?.title || 'Patient Summary',
      section: IPS_SECTIONS
        .map(definition => this.buildSection(definition, sectionResources(definition)))
        .filter((section): section is fhir4.CompositionSection => !!section)
    };
    delete composition.text; // a stored narrative would describe the previous version

    const entries = new Map<string, fhir4.Resource>(); // 'Type/id' -> resource; insertion order keeps the Composition first
    const add = (resource?: fhir4.Resource) => {
      if (resource?.id && !entries.has(resource.resourceType + '/' + resource.id)) {
        entries.set(resource.resourceType + '/' + resource.id, IpsDocumentService.withoutPhoto(resource));
      }
    };
    add(composition);
    add(patient);
    Object.values(content).flat().forEach(add);
    placeholders.forEach(add);
    add(author.resource);
    (await this.fetchParticipants([...entries.values()], new Set(entries.keys()), baseUrl)).forEach(add);

    const bundle: fhir4.Bundle<fhir4.Resource> = {
      resourceType: 'Bundle',
      identifier: {system: 'urn:ietf:rfc:3986', value: 'urn:uuid:' + IpsDocumentService.uuid()},
      type: 'document',
      timestamp: now,
      entry: [...entries].map(([ref, resource]) => ({fullUrl: baseUrl + ref, resource}))
    };
    return {composition, bundle, content, placeholders};
  }

  /**
   * "No information" entry of a required section (absent-unknown-uv-ips), e.g. AllergyIntolerance no-allergy-info, followed by
   * the resources it refers to (the Device of a DeviceUseStatement)
   * @return empty for the other sections
   */
  static noInformation(key: keyof IpsContent, patientRef: string): fhir4.Resource[] {
    const entry = IpsDocumentService.noInformationEntry(key, patientRef);
    if (entry?.resourceType === 'DeviceUseStatement') {
      const device: fhir4.Device = {
        resourceType: 'Device',
        id: IpsDocumentService.uuid(),
        type: {coding: [{system: ABSENT_UNKNOWN, code: 'no-device-info', display: 'No information about devices'}], text: 'No information about devices'},
        patient: {reference: patientRef}
      };
      (<fhir4.DeviceUseStatement>entry).device = {reference: 'Device/' + device.id, display: 'No information about devices'};
      return [entry, device];
    }
    return entry ? [entry] : [];
  }

  private static noInformationEntry(key: keyof IpsContent, patientRef: string): fhir4.Resource | undefined {
    const absent = (code: string, display: string): fhir4.CodeableConcept => ({coding: [{system: ABSENT_UNKNOWN, code, display}], text: display});
    switch (key) {
      case 'allergies':
        return <fhir4.AllergyIntolerance>{
          resourceType: 'AllergyIntolerance',
          id: IpsDocumentService.uuid(),
          // ait-1: clinicalStatus is required unless entered-in-error
          clinicalStatus: {coding: [{system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active', display: 'Active'}]},
          code: absent('no-allergy-info', 'No information about allergies'),
          patient: {reference: patientRef}
        };
      case 'conditions':
        return <fhir4.Condition>{
          resourceType: 'Condition',
          id: IpsDocumentService.uuid(),
          clinicalStatus: {coding: [{system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active'}]},
          code: absent('no-problem-info', 'No information about problems'),
          subject: {reference: patientRef}
        };
      case 'medications':
        return <fhir4.MedicationStatement>{
          resourceType: 'MedicationStatement',
          id: IpsDocumentService.uuid(),
          status: 'unknown',
          medicationCodeableConcept: absent('no-medication-info', 'No information about medications'),
          subject: {reference: patientRef},
          // effective[x] is required by the IPS profile: unknown
          _effectiveDateTime: {extension: [{url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown'}]}
        };
      case 'procedures':
        return <fhir4.Procedure>{
          resourceType: 'Procedure',
          id: IpsDocumentService.uuid(),
          status: 'unknown',
          code: absent('no-procedure-info', 'No information about past history of procedures'),
          subject: {reference: patientRef},
          // performed[x] is required by the IPS profile: unknown
          _performedDateTime: {extension: [{url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown'}]}
        };
      case 'devices':
        // the Device (no-device-info) is added by noInformation
        return <fhir4.DeviceUseStatement>{
          resourceType: 'DeviceUseStatement',
          id: IpsDocumentService.uuid(),
          status: 'active',
          subject: {reference: patientRef},
          device: {display: 'No information about devices'},
          _timingDateTime: {extension: [{url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason', valueCode: 'unknown'}]}
        };
      default:
        return undefined;
    }
  }

  /** Download the IPS document Bundle as a JSON file */
  download(document: IpsDocument, fileName = 'IPS.json') {
    FileUtils.downloadJson(document.bundle, fileName, 'application/fhir+json');
  }

  /**
   * Save the IPS Composition on the FHIR server and issue it as a SMART Health Card
   * @return the issued verifiable credentials (compact JWS)
   */
  async issueHealthCard(document: IpsDocument): Promise<string[]> {
    const patientId = document.composition.subject?.reference?.split('/').pop();
    if (!patientId) {
      throw new Error('The IPS Composition has no subject.');
    }
    await this.sof.create<fhir4.Composition>(IpsDocumentService.storedComposition(document), document.composition.id);
    return this.healthCards.issue(patientId, {credentialType: [IpsDocumentService.CREDENTIAL_TYPE]});
  }

  /**
   * The Composition as stored on the FHIR server: the "no information" placeholders exist only in the document Bundle, so
   * their sections get an emptyReason there instead of references to resources the server does not have
   */
  private static storedComposition(document: IpsDocument): fhir4.Composition {
    const placeholders = new Set((document.placeholders || []).map(resource => resource.resourceType + '/' + resource.id));
    if (!placeholders.size) {
      return document.composition;
    }
    return {
      ...document.composition,
      section: (document.composition.section || []).map(section => {
        const entry = (section.entry || []).filter(reference => !placeholders.has(reference.reference || ''));
        if (entry.length === (section.entry || []).length) {
          return section;
        }
        const {entry: _entry, ...rest} = section;
        return entry.length ? {...rest, entry} : {
          ...rest,
          emptyReason: {coding: [{system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason', code: 'unavailable', display: 'Unavailable'}]}
        };
      })
    };
  }

  private buildSection(definition: IpsSectionDefinition, resources: fhir4.Resource[]): fhir4.CompositionSection | undefined {
    if (!resources.length) {
      return definition.required ? {
        title: definition.title,
        code: {coding: [definition.code]},
        text: {status: 'generated', div: IpsDocumentService.xhtml('No information available')},
        emptyReason: {
          coding: [{system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason', code: 'unavailable', display: 'Unavailable'}]
        }
      } : undefined;
    }
    return {
      title: definition.title,
      code: {coding: [definition.code]},
      text: {
        status: 'generated',
        div: IpsDocumentService.xhtml('<ul>' + resources.map(resource =>
          '<li>' + IpsDocumentService.escapeHtml(IpsDocumentService.describe(resource)) + '</li>').join('') + '</ul>')
      },
      entry: resources.map(resource => ({reference: resource.resourceType + '/' + resource.id}))
    };
  }

  /**
   * Composition author: the logged-in user's fhirUser, or a Practitioner with the id token subject as id;
   * a display-only reference when neither exists on the server
   */
  private async resolveAuthor(client: FhirClient, patient: fhir4.Patient): Promise<{ reference: fhir4.Reference, resource?: fhir4.Resource }> {
    const idToken: any = client.getIdToken();
    const candidates = [client.getFhirUser(), idToken?.sub ? 'Practitioner/' + idToken.sub : undefined];
    for (const candidate of candidates) {
      const match = candidate?.match(/(Practitioner|PractitionerRole|Patient|RelatedPerson|Organization|Device)\/([^\/]+)$/);
      if (!match) {
        continue;
      }
      const [, resourceType, id] = match;
      if (resourceType === 'Patient' && id === patient.id) {
        return {reference: {reference: 'Patient/' + id}};
      }
      const resource = await this.sof.search<fhir4.Resource>(resourceType, {_id: id})
        .then(bundle => IpsDocumentService.resources(bundle).find(r => r.resourceType === resourceType))
        .catch(() => undefined);
      if (resource) {
        return {reference: {reference: resourceType + '/' + id}, resource};
      }
    }
    return {reference: {display: idToken?.name || idToken?.preferred_username || 'Unknown author'}};
  }

  /** Fetch the Practitioners/Organizations referenced from the given resources (two levels, e.g. Observation -> Practitioner -> Organization) */
  private async fetchParticipants(resources: fhir4.Resource[], known: Set<string>, baseUrl: string): Promise<fhir4.Resource[]> {
    const fetched: fhir4.Resource[] = [];
    let pending = resources;
    for (let level = 0; level < 2 && pending.length; level++) {
      const missing: { [resourceType: string]: Set<string> } = {};
      pending.flatMap(resource => IpsDocumentService.references(resource)).forEach(reference => {
        const match = reference.replace(baseUrl, '').match(/^([A-Za-z]+)\/([^\/]+)$/);
        if (match && PARTICIPANT_TYPES.includes(match[1]) && !known.has(match[0])) {
          (missing[match[1]] = missing[match[1]] || new Set<string>()).add(match[2]);
          known.add(match[0]);
        }
      });
      pending = (await Promise.all(Object.entries(missing).map(([resourceType, ids]) =>
        this.sof.search<fhir4.Resource>(resourceType, {_id: [...ids].join(','), _count: ids.size})
          .then(bundle => IpsDocumentService.resources(bundle).filter(resource => resource.resourceType === resourceType))
          .catch(err => {
            console.warn(`Referenced ${resourceType} resources could not be fetched for the IPS`, err);
            return [];
          })))).flat();
      fetched.push(...pending);
    }
    return fetched;
  }

  /** One-line, human-readable description of a resource for the section narrative */
  static describe(resource: fhir4.Resource): string {
    const concept = (codeableConcept?: fhir4.CodeableConcept) => codeableConcept?.text
      || codeableConcept?.coding?.find(coding => coding.display)?.display || codeableConcept?.coding?.at(0)?.code || '';
    const date = (dateTime?: string) => dateTime?.substring(0, 10) || '';
    const value = (element: { valueQuantity?: fhir4.Quantity, valueCodeableConcept?: fhir4.CodeableConcept, valueString?: string,
      valueBoolean?: boolean, valueInteger?: number }) =>
      element.valueQuantity?.value !== undefined
        ? [element.valueQuantity.value, element.valueQuantity.unit || element.valueQuantity.code].filter(part => part !== undefined).join(' ')
        : concept(element.valueCodeableConcept) || element.valueString || (element.valueBoolean ?? element.valueInteger ?? '').toString();
    const join = (...parts: (string | undefined)[]) => parts.filter(part => !!part).join(', ');
    // "no information" entries: just their text
    const absent = [(<any>resource).code, (<any>resource).medicationCodeableConcept, (<any>resource).type]
      .find((codeableConcept?: fhir4.CodeableConcept) => codeableConcept?.coding?.some(coding => coding.system === ABSENT_UNKNOWN));
    if (absent) {
      return concept(absent);
    }
    switch (resource.resourceType) {
      case 'Condition': {
        const condition = <fhir4.Condition>resource;
        return join(concept(condition.code), concept(condition.clinicalStatus), date(condition.onsetDateTime || condition.recordedDate));
      }
      case 'MedicationStatement': {
        const statement = <fhir4.MedicationStatement>resource;
        return join(concept(statement.medicationCodeableConcept) || statement.medicationReference?.display,
          statement.dosage?.map(dosage => dosage.text).filter(text => !!text).join('; '),
          date(statement.effectiveDateTime || statement.effectivePeriod?.start));
      }
      case 'AllergyIntolerance': {
        const allergy = <fhir4.AllergyIntolerance>resource;
        return join(concept(allergy.code), allergy.criticality ? 'criticality ' + allergy.criticality : '', date(allergy.onsetDateTime));
      }
      case 'Immunization': {
        const immunization = <fhir4.Immunization>resource;
        return join(concept(immunization.vaccineCode), date(immunization.occurrenceDateTime));
      }
      case 'Procedure': {
        const procedure = <fhir4.Procedure>resource;
        return join(concept(procedure.code), date(procedure.performedDateTime || procedure.performedPeriod?.start));
      }
      case 'DeviceUseStatement': {
        const statement = <fhir4.DeviceUseStatement>resource;
        return join(statement.device?.display || statement.device?.reference, date(statement.timingDateTime || statement.recordedOn));
      }
      case 'Observation': {
        const observation = <fhir4.Observation>resource;
        const result = value(observation)
          || observation.component?.map(component => concept(component.code) + ': ' + value(component)).join('; ');
        return join(concept(observation.code), result, date(observation.effectiveDateTime || observation.effectivePeriod?.start || observation.issued));
      }
      default:
        return resource.resourceType + '/' + resource.id;
    }
  }

  private static resources<T extends fhir4.Resource>(bundle?: fhir4.Bundle<T>): T[] {
    return (bundle?.entry || []).map(entry => entry.resource).filter((resource): resource is T => !!resource);
  }

  /** All Reference.reference values in a resource */
  private static references(value: any): string[] {
    if (Array.isArray(value)) {
      return value.flatMap(item => IpsDocumentService.references(item));
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, child]) =>
        key === 'reference' && typeof child === 'string' ? [child] : IpsDocumentService.references(child));
    }
    return [];
  }

  /** Photos are left out to keep the document small */
  private static withoutPhoto<T extends fhir4.Resource>(resource: T): T {
    if (!('photo' in resource)) {
      return resource;
    }
    const copy: any = {...resource};
    delete copy.photo;
    return copy;
  }

  private static xhtml(content: string): string {
    return '<div xmlns="http://www.w3.org/1999/xhtml">' + content + '</div>';
  }

  private static escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private static uuid(): string {
    return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }
}
