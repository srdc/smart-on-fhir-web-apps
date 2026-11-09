import {Inject, Injectable, Optional} from '@angular/core';
import {HEALTH_CARD_PROFILE_PROVIDERS, HealthCardProfile, HealthCardProfileProvider} from './health-card-profile';
import {SmartHealthCardService} from './smart-health-card.service';

/** Collects the health card profiles of all registered providers */
@Injectable({
  providedIn: 'root'
})
export class HealthCardProfileService {

  constructor(private healthCards: SmartHealthCardService,
              @Optional() @Inject(HEALTH_CARD_PROFILE_PROVIDERS) private providers: HealthCardProfileProvider[] | null) {
  }

  /**
   * Profiles in provider registration order. Providers issuing cards are skipped when the FHIR server does not support
   * $health-cards-issue (see HealthCardProfileProvider.requiresIssueOperation).
   */
  async profiles(): Promise<HealthCardProfile[]> {
    if (!this.providers?.length) {
      return [];
    }
    const issueSupported = this.providers.some(provider => provider.requiresIssueOperation !== false)
      ? await this.healthCards.isIssueSupported() : false;
    const providers = this.providers.filter(provider => issueSupported || provider.requiresIssueOperation === false);
    const profiles = (await Promise.all(providers.map(provider => provider.profiles().catch(err => {
      console.warn('Health card profiles could not be loaded', err);
      return <HealthCardProfile[]>[];
    })))).flat();
    return profiles.filter((profile, index) => profiles.findIndex(other => other.id === profile.id) === index);
  }
}
