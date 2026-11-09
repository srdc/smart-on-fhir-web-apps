import {Injectable} from '@angular/core';
import {DEFAULT_IDENTITY_CLAIMS, HealthCardProfile, HealthCardProfileProvider} from './health-card-profile';
import {SmartHealthCardService} from './smart-health-card.service';

/**
 * The patient's active care plan as a signed SMART Health Card: the FHIR server's $health-cards-issue with
 * credentialType CarePlan puts the active CarePlan(s) and the resources they reference (goals, activities, care team...)
 * in the card.
 *
 * Not registered in HealthCardProfileService by default (see HealthCardConfig.healthCardProfiles.carePlan):
 * care plan pages inject it and offer the profile on their own.
 */
@Injectable({
  providedIn: 'root'
})
export class CarePlanHealthCardProfileProvider implements HealthCardProfileProvider {

  static readonly PROFILE_ID = 'care-plan';

  constructor(private healthCards: SmartHealthCardService) {
  }

  /**
   * The care plan profile; empty when the FHIR server does not support $health-cards-issue
   * @param label see profile()
   */
  async profiles(label?: string): Promise<HealthCardProfile[]> {
    return (await this.healthCards.isIssueSupported()) ? [this.profile(label)] : [];
  }

  /** @param label shown to the user and used as the SMART Health Link label, e.g. the app's name for care plans */
  profile(label = 'Care Plan'): HealthCardProfile {
    return {
      id: CarePlanHealthCardProfileProvider.PROFILE_ID,
      label,
      description: 'The active care plan with its goals, signed by the FHIR server as a Smart Health Card.',
      source: 'CarePlan',
      signed: true,
      requirements: [{resourceType: 'CarePlan', codes: []}],
      issue: async (patientId: string) => ({
        verifiableCredentials: await this.healthCards.issue(patientId, {
          credentialType: ['CarePlan'],
          includeIdentityClaim: DEFAULT_IDENTITY_CLAIMS
        })
      })
    };
  }
}
