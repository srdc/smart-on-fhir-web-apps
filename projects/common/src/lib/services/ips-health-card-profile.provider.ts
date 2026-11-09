import {Injectable} from '@angular/core';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {HealthCardProfile, HealthCardProfileProvider} from './health-card-profile';
import {IpsDocumentService} from './ips-document.service';

/**
 * The International Patient Summary as health card profiles:
 * - the IPS document Bundle shared as-is (application/fhir+json, not signed) — the xShare Yellow Button one-time share content
 * - the IPS issued as a signed SMART Health Card by the FHIR server ($health-cards-issue with credentialType #ips)
 */
@Injectable()
export class IpsHealthCardProfileProvider implements HealthCardProfileProvider {

  constructor(private sof: SmartOnFhirService, private ipsDocuments: IpsDocumentService) {
  }

  async profiles(): Promise<HealthCardProfile[]> {
    return [{
      id: 'ips-document',
      label: 'International Patient Summary (IPS) document',
      description: 'The IPS FHIR document, shared through the link as it is (not signed by the FHIR server).',
      source: 'IPS',
      signed: false,
      issue: async (patientId: string) => ({fhir: [(await this.ipsDocuments.generate(await this.patient(patientId))).bundle]})
    }, {
      id: 'ips',
      label: 'International Patient Summary (IPS) Smart Health Card',
      description: 'The IPS signed by the FHIR server as a Smart Health Card; needs IPS support in its $health-cards-issue operation.',
      source: 'IPS',
      signed: true,
      issue: async (patientId: string) => ({
        verifiableCredentials: await this.ipsDocuments.issueHealthCard(await this.ipsDocuments.generate(await this.patient(patientId)))
      })
    }];
  }

  private async patient(patientId: string): Promise<fhir4.Patient> {
    const current = await this.sof.getPatient();
    const patient = current?.id === patientId ? current
      : <fhir4.Patient | undefined>(await this.sof.search<fhir4.Patient>('Patient', {_id: patientId})).entry?.at(0)?.resource;
    if (!patient) {
      throw new Error(`Patient '${patientId}' not found.`);
    }
    return patient;
  }
}
