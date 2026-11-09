import {Injectable} from '@angular/core';
import {ShlService} from 'ng-smart-on-fhir';
import {HealthCardProfile, HealthCardProfileProvider} from './health-card-profile';
import {ReceivedHealthCard, SharedLinkVaultService} from './shared-link-vault.service';

/**
 * SMART Health Cards the patient received (e.g. a care plan a clinician shared) and keeps in the encrypted link vault,
 * offered to share again unchanged, as signed by their issuers. Available while the vault is unlocked.
 */
@Injectable({
  providedIn: 'root'
})
export class ReceivedHealthCardProfileProvider implements HealthCardProfileProvider {

  static readonly PROFILE_ID_PREFIX = 'received:';

  readonly requiresIssueOperation = false;

  constructor(private vault: SharedLinkVaultService, private shl: ShlService) {
  }

  /** Received cards of the unlocked vault */
  async profiles(): Promise<HealthCardProfile[]> {
    return this.profilesFor();
  }

  /** @param resourceType - only the cards containing resources of this type, e.g. CarePlan */
  async profilesFor(resourceType?: string): Promise<HealthCardProfile[]> {
    return this.vault.received.filter(card => !resourceType || card.resourceTypes.includes(resourceType))
      .map(card => this.profile(card));
  }

  profile(card: ReceivedHealthCard): HealthCardProfile {
    const issuerName = this.shl.trustedIssuer(card.issuer)?.name || card.issuer;
    const issued = card.issuedAt ? new Date(card.issuedAt).toLocaleDateString() : undefined;
    return {
      id: ReceivedHealthCardProfileProvider.PROFILE_ID_PREFIX + card.id,
      label: card.label,
      description: `Received card, shared as signed by ${issuerName}${issued ? ' on ' + issued : ''}.`,
      source: 'Received',
      signed: true,
      requirements: card.resourceTypes.map(resourceType => ({resourceType, codes: []})),
      issue: async () => ({verifiableCredentials: [card.jws]})
    };
  }
}
