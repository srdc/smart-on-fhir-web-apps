import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {HealthCardProfile} from '../../services/health-card-profile';
import {SharedContent, SHLink} from '../../services/shl-api.service';
import {SharedLinkVaultService} from '../../services/shared-link-vault.service';
import {SmartHealthCardService} from '../../services/smart-health-card.service';

/**
 * "Create Smart Health Card" dialog: pick one of the given health card profiles, set an optional passcode and the link
 * expiry, then share the issued content as a SMART Health Link (QR code, copy, download, revoke). New links are saved in
 * the encrypted link vault (the Shared Links page), right away when it is unlocked, otherwise after entering its password.
 *
 * Render it with *ngIf and remove it on (closed).
 */
@Component({
  selector: 'app-share-health-card-dialog',
  templateUrl: './share-health-card-dialog.component.html'
})
export class ShareHealthCardDialogComponent implements OnInit, OnDestroy {

  @Input({required: true}) patientId!: string;
  /** Profiles to choose from; the first one is selected */
  @Input({required: true}) profiles: HealthCardProfile[] = [];
  @Input() title = 'Create Smart Health Card';
  /**
   * Route of the app's page listing the links kept in the link vault (e.g. '/shared-links'); without it, links are not
   * offered to be kept (the app has no page to show or revoke them later)
   */
  @Input() sharedLinksUrl?: string;
  @Output() closed = new EventEmitter<void>();

  form: { profileId?: string, passcode: string, showPasscode: boolean, expiresInDays: number } =
    {passcode: '', showPasscode: false, expiresInDays: 7};
  readonly expiryOptions = [
    {days: 1, label: '1 day'},
    {days: 7, label: '1 week'},
    {days: 30, label: '1 month'}
  ];
  loading = false;
  error?: string;
  revoking?: string;              // id of the link being revoked
  /** The created link is in the link vault */
  saved = false;
  saveError?: string;
  content?: SharedContent;        // issued cards (JWS) and/or FHIR resources of the created link
  profile?: HealthCardProfile;    // profile of the created content
  link?: SHLink;

  constructor(private healthCards: SmartHealthCardService, public vault: SharedLinkVaultService) {
  }

  ngOnInit(): void {
    this.form.profileId = this.profiles.at(0)?.id;
    this.vault.refresh();
    document.body.classList.add('modal-open'); // no page scrolling behind the dialog
    setTimeout(() => document.getElementById(this.profiles.length > 1 ? 'shc-profile' : 'shc-passcode')?.focus());
  }

  ngOnDestroy(): void {
    document.body.classList.remove('modal-open');
  }

  /** Whether cards can be shared as SMART Health Links (passcode and expiry apply to the link) */
  get linksEnabled(): boolean {
    return this.healthCards.linksEnabled;
  }

  get selectedProfile(): HealthCardProfile | undefined {
    return this.profiles.find(p => p.id === this.form.profileId);
  }

  /** Number of signed cards and FHIR files in the created link */
  get fileCount(): number {
    return (this.content?.verifiableCredentials?.length || 0) + (this.content?.fhir?.length || 0);
  }

  close(): void {
    if (this.loading) return;
    this.closed.emit();
  }

  /**
   * Issue the selected profile and share it as a SMART Health Link (with the passcode and expiry of the form)
   * when an SHL server is configured
   */
  async create(): Promise<void> {
    const profile = this.selectedProfile;
    if (!this.patientId || !profile || this.loading) return;
    this.loading = true;
    this.error = undefined;
    this.content = this.link = this.profile = undefined;
    this.saved = false;
    this.saveError = undefined;
    try {
      const content = await profile.issue(this.patientId);
      if (!content.verifiableCredentials?.length && !content.fhir?.length) {
        this.error = profile.signed
          ? `The FHIR server did not issue a Smart Health Card for "${profile.label}": no matching data for this patient.`
          : `There is no data to share for "${profile.label}".`;
        return;
      }
      this.content = content;
      this.profile = profile;
      if (this.healthCards.linksEnabled) {
        const exp = Math.floor(Date.now() / 1000) + this.form.expiresInDays * 24 * 3600;
        this.link = await this.healthCards.createLink(content, profile.label, this.form.passcode || undefined, {exp});
        if (this.vault.isUnlocked) {
          await this.saveLink();
        }
      }
    } catch (err) {
      console.error('Smart Health Card could not be created', err);
      this.error = this.content
        ? 'The Smart Health Card was issued, but the SMART Health Link could not be created. You can still download the card.'
        : 'The Smart Health Card could not be created.';
    } finally {
      this.loading = false;
    }
  }

  download(): void {
    if (this.content) {
      this.healthCards.downloadContent(this.content,
        `${(this.profile?.id || 'health-card').replace(/[^A-Za-z0-9_-]/g, '-')}-${this.patientId}`);
    }
  }

  /** Keep the created link in the link vault (it must be unlocked) */
  async saveLink(): Promise<void> {
    if (!this.link || this.saved) return;
    this.saveError = undefined;
    try {
      await this.vault.add(this.link);
      this.saved = true;
    } catch (err) {
      console.error('Link could not be saved', err);
      this.saveError = (err as Error)?.message || 'The link could not be saved.';
    }
  }

  /** Revoke the link just created */
  async revokeLink(target: SHLink): Promise<void> {
    const id = target.id;
    if (!id || this.revoking) return;
    if (!confirm('Revoke this link? Anyone who has it will no longer be able to open it.')) return;
    this.revoking = id;
    this.error = undefined;
    try {
      await this.healthCards.revokeLink(target);
    } catch (err) {
      console.error('Link could not be revoked', err);
      this.error = 'The link could not be revoked. Please try again.';
    } finally {
      this.revoking = undefined;
    }
  }
}
