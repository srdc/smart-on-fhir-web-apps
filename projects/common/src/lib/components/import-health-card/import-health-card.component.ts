import {Component, EventEmitter, Input, OnDestroy, OnInit, Optional, Output} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {
  cardTitle, decodeQrImage, HealthCardImportPreview, HealthCardImportResult, HealthCardImportService, importGroups, patientName, patientOf,
  pastedImage, samePerson, sha256Hex, ShlContent, ShlError, ShlService, SmartOnFhirService
} from 'ng-smart-on-fhir';
import {ReceivedHealthCard, SharedLinkVaultService} from '../../services/shared-link-vault.service';

/**
 * Import a SMART Health Card or Link into the record of the FHIR server the user is logged in to.
 *
 * - As a page (/import), for users logged in without a patient (e.g. a clinician at another EHR): the patient of the
 *   card is matched to the patients of the record (or created), the data is imported and the app switches to the patient.
 * - As a dialog ([dialog]="true", [target]="patient"), to import a card into the record of the current patient, e.g.
 *   "Import Interventions" with [resourceTypes]="['CarePlan', 'Goal']".
 *
 * Imported resources get new ids and meta.source = card issuer; the original signed cards are kept (DocumentReference)
 * so they can be shared again unchanged.
 *
 * With [saveTo]="'wallet'", the signed cards are kept in the patient's encrypted link vault (Shared Links) instead of
 * the record, to share them again as signed by their issuer; the vault must be unlocked.
 */
@Component({
  selector: 'app-import-health-card',
  templateUrl: './import-health-card.component.html'
})
export class ImportHealthCardComponent implements OnInit, OnDestroy {

  /** Show as a modal dialog (render with *ngIf and remove it on (closed)) */
  @Input() dialog = false;
  @Input() title = 'Import Smart Health Card';
  /** Explanation shown above the input */
  @Input() description?: string;
  /** Import for this patient (default in page mode: the patient of the session, unless the user can select patients) */
  @Input() target?: fhir4.Patient;
  /** Import only these resource types (default: all) */
  @Input() resourceTypes?: string[];
  /** Where the cards go: the record of the FHIR server (default), or the patient's link vault (signed cards only) */
  @Input() saveTo: 'record' | 'wallet' = 'record';
  /** Change the resources before they are written (HealthCardImportOptions.beforeWrite), e.g. merge a care plan */
  @Input() beforeWrite?: (resources: fhir4.Resource[]) => fhir4.Resource[] | Promise<fhir4.Resource[]>;
  /**
   * Page opened after importing a new patient (user logins without a patient context), relative to the app's base URL,
   * e.g. 'summary'; default: the route data 'openPatientUrl', else the app's home page
   */
  @Input() openPatientUrl?: string;
  @Output() closed = new EventEmitter<void>();
  @Output() imported = new EventEmitter<HealthCardImportResult>();

  step: 'input' | 'passcode' | 'preview' | 'done' = 'input';
  link = '';
  scanning = false;
  loading = false;
  error?: string;
  passcode = {value: '', show: false, label: <string | undefined>undefined, remainingAttempts: <number | undefined>undefined};
  preview?: HealthCardImportPreview;
  choice: { patient?: string, allowUnverified: boolean, importAgain: boolean, acceptMismatch: boolean } =
    {allowUnverified: false, importAgain: false, acceptMismatch: false};
  result?: HealthCardImportResult;
  /** Number of cards saved to the link vault (saveTo wallet) */
  saved?: number;
  /** The user can switch patients (user login without a patient context) */
  canSelectPatient = false;

  readonly patientName = patientName;
  readonly CREATE = 'create';
  private passcodeResolve?: (passcode: string | null) => void;

  constructor(private sof: SmartOnFhirService, private shl: ShlService, private importer: HealthCardImportService,
              private vault: SharedLinkVaultService, @Optional() private route?: ActivatedRoute) {
  }

  async ngOnInit() {
    if (this.dialog) {
      document.body.classList.add('modal-open');
    }
    this.canSelectPatient = this.sof.canSelectPatient();
    if (!this.target && !this.dialog && !this.canSelectPatient) {
      this.target = await this.sof.getPatient();
    }
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
    this.passcodeResolve?.(null);
  }

  close(): void {
    if (this.loading) return;
    this.closed.emit();
  }

  /** Read a link/card: shlink:/... (or a viewer URL with #shlink:/...), shc:/..., a compact JWS or a .smart-health-card file */
  /**
   * @param value - link, card, or the text of a file (.smart-health-card, or a FHIR resource / Bundle such as an IPS document)
   * @param fileName - name of the file the value was read from
   */
  async read(value = this.link, fileName?: string): Promise<void> {
    value = value.trim();
    if (!value || this.loading) return;
    this.loading = true;
    this.error = undefined;
    this.preview = this.result = this.saved = undefined;
    this.choice = {allowUnverified: false, importAgain: false, acceptMismatch: false};
    try {
      const content = await this.content(value, fileName);
      this.preview = this.saveTo === 'wallet' ? await this.walletPreview(content) : await this.importer.preview(content, this.target);
      if (!this.target) {
        this.choice.patient = this.preview.candidates.length === 1 ? this.preview.candidates[0].id
          : this.preview.candidates.length ? undefined : this.CREATE;
      }
      this.step = 'preview';
    } catch (err) {
      console.error('Smart Health Card could not be read', err);
      this.step = 'input';
      this.error = err instanceof ShlError && err.reason === 'cancelled' ? undefined
        : (err as Error)?.message || 'The Smart Health Card or Link could not be read.';
    } finally {
      this.loading = false;
    }
  }

  private async content(value: string, fileName?: string): Promise<ShlContent> {
    if (value.startsWith('{')) {
      // .smart-health-card file, or a FHIR resource / Bundle (not signed), e.g. a Patient Summary sample
      return this.shl.handleFile(value, fileName || 'pasted.json');
    }
    if (value.includes('shlink:/')) {
      return this.shl.handleShl(value, (label, remainingAttempts) => this.askPasscode(label, remainingAttempts));
    }
    if (value.startsWith('shc:/') || /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value)) {
      return this.shl.handleShc(value);
    }
    throw new Error('Not a Smart Health Card or Link. Paste a link starting with "shlink:/" (or a viewer URL containing it) or a card starting with "shc:/".');
  }

  /** What would be kept in the link vault: the signed cards only (nothing is read from the FHIR server) */
  private async walletPreview(content: ShlContent): Promise<HealthCardImportPreview> {
    const groups = importGroups(content);
    const kept = this.vault.received.map(card => card.id);
    const counts: { [resourceType: string]: number } = {};
    groups.filter(group => group.kind === 'card').flatMap(group => group.entries)
      .filter(entry => entry.resource.resourceType !== 'Patient')
      .forEach(entry => counts[entry.resource.resourceType] = (counts[entry.resource.resourceType] || 0) + 1);
    const alreadyImported: number[] = [];
    for (const [index, group] of groups.entries()) {
      if (group.card && kept.includes(await sha256Hex(group.card.jws))) {
        alreadyImported.push(index);
      }
    }
    const cardPatient = patientOf(groups);
    return {
      content, groups, cardPatient, counts, alreadyImported,
      target: this.target,
      targetMatch: this.target ? samePerson(cardPatient, this.target) : undefined,
      candidates: [],
      verified: groups.filter(group => group.kind === 'card').every(group => group.card!.verified)
    };
  }

  /** Keep the signed cards in the link vault */
  private async saveToWallet(preview: HealthCardImportPreview): Promise<number> {
    const receivedAt = new Date().toISOString();
    const cards: ReceivedHealthCard[] = [];
    for (const [index, group] of preview.groups.entries()) {
      if (!group.card || (!this.choice.importAgain && preview.alreadyImported.includes(index))) {
        continue;
      }
      cards.push({
        id: await sha256Hex(group.card.jws),
        jws: group.card.jws,
        issuer: group.card.issuer,
        verified: group.card.verified,
        label: cardTitle(group),
        resourceTypes: [...new Set(group.entries.map(entry => entry.resource.resourceType).filter(type => type !== 'Patient'))],
        issuedAt: group.card.issuedAt?.toISOString(),
        receivedAt
      });
    }
    if (cards.length) {
      await this.vault.addReceived(cards);
    }
    return cards.length;
  }

  /** Passcode of a P link: shows the passcode form and waits for it (again after a wrong passcode) */
  private askPasscode(label: string | undefined, remainingAttempts: number | undefined): Promise<string | null> {
    this.passcode = {value: '', show: false, label, remainingAttempts};
    this.error = remainingAttempts !== undefined ? 'Wrong passcode.' : undefined;
    this.step = 'passcode';
    this.loading = false;
    setTimeout(() => document.getElementById('shc-import-passcode')?.focus());
    return new Promise(resolve => this.passcodeResolve = resolve);
  }

  submitPasscode(cancel = false): void {
    const resolve = this.passcodeResolve;
    if (!resolve || (!cancel && !this.passcode.value)) return;
    this.passcodeResolve = undefined;
    this.error = undefined;
    this.loading = !cancel;
    resolve(cancel ? null : this.passcode.value);
  }

  scanned(value: string): void {
    this.scanning = false;
    this.link = value;
    this.read(value);
  }

  /** Open a file: a QR code image (screenshot, downloaded QR), a .smart-health-card file or a FHIR JSON file */
  async readFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.link = '';
    if (file.type.startsWith('image/')) {
      await this.readQrImage(file);
    } else {
      await this.read(await file.text(), file.name);
    }
  }

  /** A QR code image pasted into the link field (e.g. a screenshot copied with the snipping tool) */
  async pasted(event: ClipboardEvent): Promise<void> {
    const image = pastedImage(event);
    if (image) {
      event.preventDefault();
      await this.readQrImage(image);
    }
  }

  /** Read the link or card in a QR code image, without the camera */
  private async readQrImage(image: Blob): Promise<void> {
    if (this.loading) return;
    this.error = undefined;
    this.scanning = false;
    let value: string | undefined;
    try {
      value = await decodeQrImage(image);
    } catch (err) {
      console.error('QR image could not be read', err);
    }
    if (!value) {
      this.error = 'No QR code could be read in the image. Use an image with the whole QR code, not cropped or blurred.';
      return;
    }
    const shlStart = value.indexOf('shlink:/');
    if (shlStart < 0 && !value.startsWith('shc:/')) {
      this.error = 'The QR code does not contain a Smart Health Card or Link.';
      return;
    }
    this.link = shlStart >= 0 ? value.slice(shlStart) : value;
    await this.read(this.link);
  }


  /** Resource counts of the preview, limited to the imported types */
  get counts(): { type: string, count: number }[] {
    return Object.entries(this.preview?.counts || {})
      .filter(([type]) => !this.resourceTypes || this.resourceTypes.includes(type))
      .map(([type, count]) => ({type, count}))
      .sort((a, b) => a.type.localeCompare(b.type));
  }

  /** Resources of the cards that are not imported because of resourceTypes */
  get notImportedCount(): number {
    return Object.entries(this.preview?.counts || {}).filter(([type]) => this.resourceTypes && !this.resourceTypes.includes(type))
      .reduce((sum, [, count]) => sum + count, 0);
  }

  /** Source of unsigned resources: the file name, or the server they come from */
  sourceLabel(source: string): string {
    return source.startsWith('urn:file:') ? 'File ' + decodeURIComponent(source.slice('urn:file:'.length))
      : source === 'urn:smart-health-link' ? 'Smart Health Link' : source;
  }

  get unsignedFiles(): number {
    return this.preview?.groups.filter(group => group.kind === 'fhir').length || 0;
  }

  get allImportedBefore(): boolean {
    return !!this.preview && this.preview.groups.length > 0 && this.preview.alreadyImported.length === this.preview.groups.length;
  }

  get canImport(): boolean {
    const preview = this.preview;
    if (!preview || this.loading || !this.counts.length) return false;
    if (this.saveTo === 'wallet' && (!this.vault.isUnlocked || !preview.groups.some(group => group.kind === 'card'))) return false;
    if (!preview.verified && !this.choice.allowUnverified) return false;
    if (this.target) {
      return preview.targetMatch !== 'mismatch' || this.choice.acceptMismatch;
    }
    return !!this.choice.patient && (this.choice.patient !== this.CREATE || !!preview.cardPatient);
  }

  async import(): Promise<void> {
    const preview = this.preview;
    if (!preview || !this.canImport) return;
    if (this.saveTo === 'wallet') {
      this.loading = true;
      this.error = undefined;
      try {
        this.saved = await this.saveToWallet(preview);
        this.step = 'done';
      } catch (err) {
        console.error('Smart Health Card could not be saved', err);
        this.error = 'The card could not be saved: ' + ((err as Error)?.message || err);
      } finally {
        this.loading = false;
      }
      return;
    }
    const patient = this.target || (this.choice.patient === this.CREATE ? 'create'
      : preview.candidates.find(candidate => candidate.id === this.choice.patient));
    if (!patient) return;
    this.loading = true;
    this.error = undefined;
    try {
      this.result = await this.importer.import(preview, {
        patient,
        resourceTypes: this.resourceTypes,
        allowUnverified: this.choice.allowUnverified,
        importAgain: this.choice.importAgain,
        beforeWrite: this.beforeWrite
      });
      this.step = 'done';
      this.imported.emit(this.result);
    } catch (err) {
      console.error('Smart Health Card could not be imported', err);
      this.error = 'The data could not be imported: ' + ((err as Error)?.message || err);
    } finally {
      this.loading = false;
    }
  }

  get importedCounts(): { type: string, count: number }[] {
    return Object.entries(this.result?.counts || {}).map(([type, count]) => ({type, count})).sort((a, b) => a.type.localeCompare(b.type));
  }

  /** Work on the imported patient (reloads the app with the patient selected) */
  openPatient(): void {
    if (!this.result) return;
    this.sof.selectPatient(this.result.patient);
    const url = this.openPatientUrl ?? this.route?.snapshot.data['openPatientUrl'] ?? '';
    window.location.assign(new URL(url, document.baseURI).href);
  }

  restart(): void {
    this.step = 'input';
    this.link = '';
    this.preview = this.result = this.saved = undefined;
    this.error = undefined;
  }
}
