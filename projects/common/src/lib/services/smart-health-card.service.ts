import {Injectable} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {RevocableLink, SharedContent, ShlApiService, SHLink, SHLinkOptions} from './shl-api.service';
import {SharedLinkVaultService} from './shared-link-vault.service';
import {FileUtils} from '../utils/file-utils';

/** Input parameters of the $health-cards-issue operation */
export interface HealthCardIssueRequest {
  /** FHIR resource types (e.g. Immunization, Condition) or other credential types understood by the issuer */
  credentialType: string[];
  /** ValueSet canonical URLs used to filter the resources */
  credentialValueSet?: string[];
  /** Patient elements to include as identity claims, e.g. Patient.name */
  includeIdentityClaim?: string[];
  /** Only include resources updated since this dateTime */
  since?: string;
}

/**
 * SMART Health Card issuance through the FHIR server's Patient/[id]/$health-cards-issue operation,
 * plus sharing the issued cards as SMART Health Links or .smart-health-card files.
 */
@Injectable({
  providedIn: 'root'
})
export class SmartHealthCardService {

  static readonly OPERATION_NAME = 'health-cards-issue';
  static readonly OPERATION_DEFINITION = 'http://hl7.org/fhir/uv/smart-health-cards-and-links/OperationDefinition/patient-i-health-cards-issue';

  /** CapabilityStatement check results per FHIR server */
  private issueSupport = new Map<string, Promise<boolean>>();

  constructor(private sof: SmartOnFhirService, private shl: ShlApiService, private vault: SharedLinkVaultService) {
  }

  /** Whether issued cards can be shared as SMART Health Links (an SHL server is configured) */
  get linksEnabled(): boolean {
    return this.shl.enabled;
  }

  /**
   * Whether the connected FHIR server declares $health-cards-issue in its CapabilityStatement.
   * The result is cached per server. Offline (SHC/SHL) sessions have no server and resolve to false.
   */
  async isIssueSupported(): Promise<boolean> {
    const client = await this.sof.getClient().catch(() => undefined);
    const serverUrl = client?.state.serverUrl;
    if (!client || !serverUrl) {
      return false;
    }
    let support = this.issueSupport.get(serverUrl);
    if (!support) {
      support = client.request<fhir4.CapabilityStatement>('metadata')
        .then(capabilityStatement => SmartHealthCardService.declaresIssueOperation(capabilityStatement))
        .catch(err => {
          console.warn('CapabilityStatement could not be read from ' + serverUrl, err);
          this.issueSupport.delete(serverUrl); // retry on the next call
          return false;
        });
      this.issueSupport.set(serverUrl, support);
    }
    return support;
  }

  /** Whether $health-cards-issue is declared at the system level or on the Patient resource */
  static declaresIssueOperation(capabilityStatement?: fhir4.CapabilityStatement): boolean {
    const matches = (operation: fhir4.CapabilityStatementRestResourceOperation) =>
      operation.name?.replace(/^\$/, '') === SmartHealthCardService.OPERATION_NAME
      || operation.definition?.split('|')[0] === SmartHealthCardService.OPERATION_DEFINITION;
    return (capabilityStatement?.rest || []).some(rest =>
      (rest.operation || []).some(matches)
      || (rest.resource || []).some(resource => resource.type === 'Patient' && (resource.operation || []).some(matches)));
  }

  /**
   * Call Patient/[id]/$health-cards-issue
   * @return the issued verifiable credentials (compact JWS); empty if the server found nothing to put in a card
   */
  async issue(patientId: string, request: HealthCardIssueRequest): Promise<string[]> {
    const parameter: fhir4.ParametersParameter[] = [
      ...request.credentialType.map(valueUri => ({name: 'credentialType', valueUri})),
      ...(request.credentialValueSet || []).map(valueUri => ({name: 'credentialValueSet', valueUri})),
      ...(request.includeIdentityClaim || []).map(valueString => ({name: 'includeIdentityClaim', valueString})),
      ...(request.since ? [{name: '_since', valueDateTime: request.since}] : [])
    ];
    const response = await this.sof.operation<fhir4.Parameters>({
      resourceType: 'Patient',
      resourceId: patientId,
      operationName: SmartHealthCardService.OPERATION_NAME,
      params: {resourceType: 'Parameters', parameter}
    });
    return SmartHealthCardService.verifiableCredentials(response);
  }

  /** Extract the verifiableCredential values of a $health-cards-issue response */
  static verifiableCredentials(response?: fhir4.Parameters): string[] {
    return (response?.parameter || [])
      .filter(parameter => parameter.name === 'verifiableCredential' && !!parameter.valueString)
      .map(parameter => <string>parameter.valueString);
  }

  /**
   * Share cards (and/or FHIR resources) as a SMART Health Link (needs a configured SHL server)
   * @param content - verifiable credentials, or SMART Health Cards and/or FHIR resources
   * @param service - what the link contains (e.g. IPS, CarePlan); used in the link label
   * @param passcode - optional passcode the receiver has to enter (flag P)
   * @param options - expiration (epoch seconds) and long-term (flag L) options
   */
  createLink(content: string[] | SharedContent, service: string, passcode?: string, options?: Omit<SHLinkOptions, 'passcode'>): Promise<SHLink> {
    return this.shl.create(content, service, passcode, options);
  }

  /** Revoke a shared link on the SHL server (and mark it revoked in the link vault, if it is there and unlocked) */
  async revokeLink(link: RevocableLink): Promise<void> {
    await this.shl.revoke(link);
    if (link.id) {
      await this.vault.markRevoked(link.id);
    }
  }

  /** Save the cards as a .smart-health-card file */
  download(verifiableCredentials: string[], fileName = 'health-card') {
    FileUtils.download(JSON.stringify({verifiableCredential: verifiableCredentials}),
      fileName.replace(/\.smart-health-card$/, '') + '.smart-health-card', 'application/smart-health-card');
  }

  /** Save shared content: the cards as a .smart-health-card file, FHIR resources as .json files */
  downloadContent(content: SharedContent, fileName = 'health-card') {
    if (content.verifiableCredentials?.length) {
      this.download(content.verifiableCredentials, fileName);
    }
    (content.fhir || []).forEach((resource, index, all) =>
      FileUtils.downloadJson(resource, fileName + (all.length > 1 ? '-' + (index + 1) : '') + '.json', 'application/fhir+json'));
  }
}
