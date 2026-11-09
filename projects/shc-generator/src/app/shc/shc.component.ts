import {Component, Signal} from '@angular/core';
import {Router} from "@angular/router";
import {CdsHooksService} from "cds-hooks";
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {HttpClient} from "@angular/common/http";
import {IpsContent, IpsDocument, IpsDocumentService, SharedLinkVaultService, SHLink, SmartHealthCardService, StoredLink, WrongVaultPasswordError} from "common";

@Component({
  selector: 'app-shc',
  templateUrl: './shc.component.html',
  styleUrl: './shc.component.scss'
})
export class ShcComponent {

  title = 'shc-generator';

  error: string | undefined;
  patient: fhir4.Patient|undefined;

  loading: boolean = false;
  ipsLoading: boolean = false;
  conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[] = [];
  services: string[] = [];
  selectedService: string|undefined;

  vsStatus: 'IDLE'|'LOADING'|'CREATING'|'CREATED'|'FOUND'|'ERROR' = 'IDLE';
  serviceValueSetUrls: {[serviceId: string]: string} = {};
  links: { [serviceId: string]: SHLink[] } = {};
  /** Encrypted link vault (SharedLinkVaultService) */
  vaultPassword = '';
  vaultConfirmation = '';
  vaultBusy = false;
  vaultError: string | undefined;
  readonly minPasswordLength = SharedLinkVaultService.MIN_PASSWORD_LENGTH;
  private rebuilt = new Map<string, SHLink>();
  passcode: string|undefined;
  currentTab: 'cds'|'ips'|'careplan' = 'cds';
  ips: IpsContent = {
    allergies: [],
    vitalSigns: [],
    immunizations: [],
    medications: [],
    labResults: [],
    conditions: [],
    procedures: [],
    devices: []
  };
  ipsCompositionLoading: boolean = false;
  ipsDocument: IpsDocument|undefined;
  composition: fhir4.Composition|undefined;
  ipsBundle: fhir4.Bundle<fhir4.Resource> | undefined;

  carePlanLoading: boolean = false;
  carePlan: fhir4.CarePlan|undefined;
  goals: { [carePlanId: string]: fhir4.Goal[] } = {};

  get vaultState() {
    return this.vault.state;
  }

  /** Service of the current tab: links are stored per service */
  get currentService(): string | undefined {
    return this.currentTab === 'cds' ? this.selectedService : this.currentTab === 'ips' ? 'IPS' : 'CarePlan';
  }

  /** Stored links of the current service (rebuilt once per link, so that the copy state survives change detection) */
  get stored(): SHLink[] {
    return this.vault.links
      .filter(link => link.service === this.currentService && !link.revokedAt)
      .map(link => this.rebuild(link))
      .filter((link): link is SHLink => !!link);
  }

  constructor(private sof: SmartOnFhirService, private cdsHooksService: CdsHooksService<fhir4.Resource>,
              private router: Router, private http: HttpClient, private vault: SharedLinkVaultService,
              private healthCards: SmartHealthCardService, private ipsDocuments: IpsDocumentService) {
  }

  async ngOnInit() {
    this.loading = true;
    this.patient = await this.sof.getPatient()
    this.services = (await this.cdsHooksService.listServices()).filter(service => service !== 'valueset' && service !== 'definition');
    if (this.services[0]) {
      await this.setService(this.services[0]);
    }
    this.loading = false
    this.prepareIPS();
    this.loadCarePlan();
  }

  async loadCarePlan() {
    this.carePlanLoading = true;
    try {
      const bundle = await this.sof.search<fhir4.Resource>('CarePlan', { patient: 'Patient/' + this.patient?.id, status: 'active', _sort: '-date', _count: 1, _include: '*' })
      this.carePlan = <fhir4.CarePlan>bundle.entry?.find(entry => entry.resource?.resourceType === 'CarePlan')?.resource
      if (this.carePlan?.id) {
        this.goals[this.carePlan?.id] = <fhir4.Goal[]>bundle.entry?.filter(entry => entry.resource?.resourceType === 'Goal').map(entry => entry.resource)
      }
    } catch (err) {
      alert(err)
    }
    this.carePlanLoading = false;
  }

  async setService(selectedService: string) {
    this.loading = true;
    this.vsStatus = 'LOADING';
    const vsCard = await this.cdsHooksService.callService({
      serviceId: 'valueset',
      context: { serviceId: selectedService },
      prefetch: {}
    }).catch(err => undefined)
    const vs = vsCard?.cards.at(0)?.suggestions?.at(0)?.actions?.at(0)?.resource;
    if (vs.resourceType === 'ValueSet') {
      this.serviceValueSetUrls[selectedService] = vs.url;
      const resp = await this.sof.search<fhir4.ValueSet>('ValueSet', { url: vs.url })
        .catch(err => undefined);
      const valueSet = resp?.entry?.find(entry => entry.resource?.resourceType === 'ValueSet')?.resource;
      if (!valueSet) {
        this.vsStatus = 'CREATING';
        try {
          await this.sof.create(vs);
          this.vsStatus = 'CREATED';
          this.selectedService = selectedService;
        } catch (e: Error|any) {
          this.vsStatus = 'ERROR';
          this.error = e.message;
        }
      } else {
        this.vsStatus = 'FOUND';
        this.selectedService = selectedService;
      }
    } else {
      this.error = 'CDS definition could not be fetched.';
      this.vsStatus = 'ERROR';
    }
    this.loading = false;
  }

  async createSmartHealthCard() {
    if (!this.selectedService || !this.patient?.id) { return; }
    const service = this.selectedService;
    const definition = await this.cdsHooksService.getServiceDefinition(service);
    const resourceTypes = Object.keys(Object.values<string>(definition.prefetch)
      .map(query => query.split('?')[0].split('/')[0])
      .reduce((obj: any, rt) => { obj[rt] = true; return obj; }, {}));
    const verifiableCredentials = await this.healthCards.issue(this.patient.id, {
      credentialType: resourceTypes,
      credentialValueSet: [this.serviceValueSetUrls[service]]
    });
    await this.addLink(verifiableCredentials, service);
  }

  /** Share the issued cards as a SMART Health Link and list it under the given service */
  private async addLink(verifiableCredentials: string[], service: string) {
    if (!verifiableCredentials.length) {
      alert('No Smart Health Card was issued: the server found no data for ' + service + '.');
      return;
    }
    try {
      const link = await this.healthCards.createLink(verifiableCredentials, service, this.passcode?.trim());
      this.links[service] = [link, ...(this.links[service] || [])];
    } catch (err) {
      alert(err);
    }
  }

  /** Keep a link in the encrypted link vault (unlock it below first) */
  async storeLink(link: SHLink) {
    if (!this.vault.isUnlocked) {
      this.vaultError = 'Unlock the stored links below (or create a password) to save links.';
      return;
    }
    try {
      await this.vault.add(link);
      if (link.serviceId) {
        this.links[link.serviceId].splice(this.links[link.serviceId].indexOf(link), 1);
      }
    } catch (err) {
      alert(err);
    }
  }

  async openVault() {
    if (this.vaultBusy) return;
    this.vaultError = undefined;
    const creating = this.vault.state === 'none';
    if (creating) {
      this.vaultError = SharedLinkVaultService.passwordProblem(this.vaultPassword)
        || (this.vaultPassword !== this.vaultConfirmation ? 'The passwords do not match.' : undefined);
      if (this.vaultError) return;
    }
    this.vaultBusy = true;
    try {
      const result = creating ? await this.vault.create(this.vaultPassword) : await this.vault.unlock(this.vaultPassword);
      this.vaultPassword = this.vaultConfirmation = '';
      if (result.notImported) {
        this.vaultError = result.notImported + ' older stored link(s) did not open with this password and were left as they were.';
      }
    } catch (err) {
      this.vaultError = err instanceof WrongVaultPasswordError ? 'Wrong password.' : (err as Error)?.message || String(err);
    } finally {
      this.vaultBusy = false;
    }
  }

  lockVault() {
    this.rebuilt.clear();
    this.vault.lock();
  }

  async deleteStored(link: SHLink) {
    if (!link.id || !confirm('Delete this link from the stored links? It is not revoked and keeps working until it expires.')) return;
    await this.vault.remove(link.id);
    this.rebuilt.delete(link.id);
  }

  private rebuild(stored: StoredLink): SHLink | undefined {
    if (!this.rebuilt.has(stored.id)) {
      const link = SharedLinkVaultService.toSHLink(stored);
      if (!link) return undefined;
      this.rebuilt.set(stored.id, link);
    }
    return this.rebuilt.get(stored.id);
  }

  private async prepareIPS() {
    if (!this.patient?.id) { return; }
    this.ipsLoading = true;
    this.ipsCompositionLoading = true;
    try {
      this.ips = await this.ipsDocuments.collect(this.patient.id);
      this.ipsDocument = await this.ipsDocuments.build(this.patient, this.ips);
      this.composition = this.ipsDocument.composition;
      this.ipsBundle = this.ipsDocument.bundle;
    } catch (err) {
      console.error('IPS could not be prepared', err);
    } finally {
      this.ipsLoading = false;
      this.ipsCompositionLoading = false;
    }
  }

  getDosageString(medication: fhir4.MedicationStatement): string {
    if (!medication.dosage?.length) { return ''; }
    return medication.dosage.map(dosage => {
      // if (dosage.text) { return dosage.text; }
      let dosageQuantity = '';
      if (dosage.doseAndRate?.length) {
        dosageQuantity = dosage.doseAndRate.map(dose => dose.doseQuantity?.value + ' ' + (dose.doseQuantity?.unit || dose.doseQuantity?.code)).join(', ')
      }
      if (dosage.timing) {
        if (dosage.timing.repeat) {
          return dosageQuantity + ' ' + [dosage.timing.repeat.frequency, '/', dosage.timing.repeat.period, dosage.timing.repeat.periodUnit].join('');
        }
        if (dosage.timing.event?.length) return dosage.timing.event.join(', ');
      }
      return '';
    }).join(', ')
  }

  async createIPSCard() {
    if (!this.ipsDocument) { return; }
    await this.addLink(await this.ipsDocuments.issueHealthCard(this.ipsDocument), 'IPS');
  }

  downloadIPS() {
    if (this.ipsDocument) {
      this.ipsDocuments.download(this.ipsDocument);
    }
  }

  async createCarePlanCard() {
    if (!this.patient?.id) { return; }
    await this.addLink(await this.healthCards.issue(this.patient.id, {credentialType: ['CarePlan']}), 'CarePlan');
  }
}
