import {Injectable} from '@angular/core';
import {HealthCardImportService, ShlService, SmartOnFhirService, StoredHealthCard} from 'ng-smart-on-fhir';
import {HealthCardProfile, HealthCardProfileProvider} from './health-card-profile';

/**
 * SMART Health Cards the patient received from others and imported into the record (kept as DocumentReferences by
 * HealthCardImportService), offered to share again unchanged: the original signed card is shared, so the recipient
 * verifies the signature of the original issuer. No $health-cards-issue is needed.
 */
@Injectable({
  providedIn: 'root'
})
export class ImportedHealthCardProfileProvider implements HealthCardProfileProvider {

  static readonly PROFILE_ID_PREFIX = 'imported:';

  readonly requiresIssueOperation = false;

  constructor(private sof: SmartOnFhirService, private importer: HealthCardImportService, private shl: ShlService) {
  }

  /** Imported cards of the patient of the session */
  async profiles(): Promise<HealthCardProfile[]> {
    const patient = await this.sof.getPatient();
    return patient?.id ? this.profilesFor(patient.id) : [];
  }

  /**
   * Imported cards of a patient
   * @param resourceType - only the cards containing resources of this type, e.g. CarePlan
   */
  async profilesFor(patientId: string, resourceType?: string): Promise<HealthCardProfile[]> {
    const cards = await this.importer.storedCards(patientId);
    return cards.map(card => this.profile(card)).filter((profile): profile is HealthCardProfile => !!profile
      && (!resourceType || !!profile.requirements?.some(requirement => requirement.resourceType === resourceType)));
  }

  private profile(card: StoredHealthCard): HealthCardProfile | undefined {
    let payload: ReturnType<typeof ShlService.decodeCard>;
    try {
      payload = ShlService.decodeCard(card.jws);
    } catch (err) {
      console.warn('Imported SMART Health Card cannot be read', card.documentReference.id, err);
      return undefined;
    }
    const issuer = payload.iss || card.issuer || '';
    const issuerName = this.shl.trustedIssuer(issuer)?.name || issuer;
    const resourceTypes = [...new Set((payload.vc?.credentialSubject?.fhirBundle?.entry || [])
      .map(entry => entry.resource?.resourceType).filter((type): type is fhir4.FhirResource['resourceType'] => !!type && type !== 'Patient'))];
    const issued = payload.nbf ? new Date(payload.nbf * 1000).toLocaleDateString() : undefined;
    return {
      id: ImportedHealthCardProfileProvider.PROFILE_ID_PREFIX + card.documentReference.id,
      label: card.title,
      description: `Received card, shared as signed by ${issuerName}${issued ? ' on ' + issued : ''}.`,
      source: 'Received',
      signed: true,
      requirements: resourceTypes.map(resourceType => ({resourceType, codes: []})),
      issue: async () => ({verifiableCredentials: [card.jws]})
    };
  }
}
