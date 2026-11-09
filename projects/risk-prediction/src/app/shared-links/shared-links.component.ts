import {Component, OnDestroy, OnInit} from '@angular/core';
import {Subscription} from 'rxjs';
import {
  HealthCardProfile, LinkImportResult, LinkVaultState, OwnedLink, ReceivedHealthCard, ReceivedHealthCardProfileProvider,
  SharedLinkVaultService, ShlApiService, SHLink, StoredLink
} from 'common';
import {ShlService, SmartOnFhirService} from 'ng-smart-on-fhir';

/**
 * The patient's shared SMART Health Links, kept encrypted on this device (SharedLinkVaultService):
 * show them again as QR code / link, revoke them, remove them from the list.
 * Also the cards received from others (e.g. a care plan a clinician shared): added by scanning/pasting their link, and
 * shared again as signed by their issuer.
 */
@Component({
  selector: 'rp-shared-links',
  templateUrl: './shared-links.component.html'
})
export class SharedLinksComponent implements OnInit, OnDestroy {

  state: LinkVaultState = 'unavailable';
  links: StoredLink[] = [];
  received: ReceivedHealthCard[] = [];
  patient?: fhir4.Patient;
  /** Add received card dialog (app-import-health-card in wallet mode) */
  receiveDialogOpen = false;
  /** Share dialog of a received card */
  sharing?: { card: ReceivedHealthCard, profiles: HealthCardProfile[] };
  /** Rebuilt links whose QR code is shown, by id */
  shown: { [id: string]: SHLink } = {};
  legacyCount = 0;
  notice?: string;
  error?: string;
  busy?: string;            // id of the link being revoked/removed

  changingPassword = false;
  passwordForm = {current: '', next: '', confirmation: ''};
  passwordBusy = false;
  passwordError?: string;

  /** Links bound to the user's account on the SHL server */
  ownedLinks?: OwnedLink[];
  ownedLoading = false;
  ownedError?: string;

  private subscription?: Subscription;

  constructor(public vault: SharedLinkVaultService, public shl: ShlApiService, private sof: SmartOnFhirService,
              private shlReader: ShlService, private receivedProfiles: ReceivedHealthCardProfileProvider) {
  }

  async ngOnInit(): Promise<void> {
    this.sof.getPatient().then(patient => this.patient = patient).catch(() => undefined);
    this.subscription = this.vault.state$.subscribe(state => {
      this.state = state;
      this.reload();
    });
    await this.vault.refresh();
    this.legacyCount = await this.vault.legacyCount();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  opened(result: LinkImportResult): void {
    this.notice = [
      result.imported ? `${result.imported} earlier link${result.imported > 1 ? 's were' : ' was'} moved into your encrypted list.` : '',
      result.notImported ? `${result.notImported} older saved link${result.notImported > 1 ? 's' : ''} did not open with this password and stayed where ${result.notImported > 1 ? 'they were' : 'it was'}.` : ''
    ].filter(Boolean).join(' ') || undefined;
    this.vault.legacyCount().then(count => this.legacyCount = count);
    this.reload();
  }

  status(link: StoredLink): 'revoked' | 'expired' | 'active' {
    return SharedLinkVaultService.status(link);
  }

  canRevoke(link: StoredLink): boolean {
    return this.status(link) === 'active' && (!!link.managementToken || (!!link.ownerBound && this.shl.ownerAuthEnabled));
  }

  toggleQr(link: StoredLink): void {
    if (this.shown[link.id]) {
      delete this.shown[link.id];
    } else {
      const rebuilt = SharedLinkVaultService.toSHLink(link);
      if (rebuilt) this.shown[link.id] = rebuilt;
    }
  }

  copy(link: StoredLink): void {
    (this.shown[link.id] || SharedLinkVaultService.toSHLink(link))?.copyToClipboard();
    this.notice = 'Link copied.';
  }

  async revoke(link: StoredLink): Promise<void> {
    if (this.busy || !confirm('Revoke this link? Anyone who has it will no longer be able to open it.')) return;
    this.busy = link.id;
    this.error = undefined;
    try {
      await this.vault.revoke(link.id);
      delete this.shown[link.id];
      this.reload();
    } catch (err) {
      console.error('Link could not be revoked', err);
      this.error = 'The link could not be revoked. Please try again.';
    } finally {
      this.busy = undefined;
    }
  }

  async remove(link: StoredLink): Promise<void> {
    if (this.busy) return;
    if (this.status(link) === 'active'
      && !confirm('Remove this link from the list without revoking it? It keeps working until it expires, and you will not be able to revoke it from here.')) {
      return;
    }
    this.busy = link.id;
    try {
      await this.vault.remove(link.id);
      delete this.shown[link.id];
      this.reload();
    } catch (err) {
      this.error = (err as Error)?.message || 'The link could not be removed.';
    } finally {
      this.busy = undefined;
    }
  }

  lock(): void {
    this.shown = {};
    this.vault.lock();
  }

  async changePassword(): Promise<void> {
    this.passwordError = SharedLinkVaultService.passwordProblem(this.passwordForm.next)
      || (this.passwordForm.next !== this.passwordForm.confirmation ? 'The new passwords do not match.' : undefined);
    if (this.passwordError) return;
    this.passwordBusy = true;
    try {
      await this.vault.changePassword(this.passwordForm.current, this.passwordForm.next);
      this.passwordForm = {current: '', next: '', confirmation: ''};
      this.changingPassword = false;
      this.notice = 'Password changed.';
    } catch (err) {
      this.passwordError = (err as Error)?.name === 'WrongVaultPasswordError' ? 'The current password is wrong.'
        : (err as Error)?.message || 'The password could not be changed.';
    } finally {
      this.passwordBusy = false;
    }
  }

  async forgotPassword(): Promise<void> {
    const revocable = this.shl.ownerAuthEnabled
      ? ' Links created while you were signed in can still be revoked from your account below.'
      : ' The links keep working until they expire.';
    if (!confirm('Your password cannot be recovered. Delete your saved links from this device and start again?' + revocable)) return;
    await this.vault.reset();
    this.shown = {};
    this.notice = 'Your saved links were deleted from this device.';
    if (this.shl.ownerAuthEnabled) {
      await this.loadOwnedLinks();
    }
  }

  async loadOwnedLinks(): Promise<void> {
    this.ownedLoading = true;
    this.ownedError = undefined;
    try {
      this.ownedLinks = await this.shl.ownedLinks();
    } catch (err) {
      console.error('Links of the account could not be loaded', err);
      this.ownedError = 'Your links could not be loaded from the server. Please sign in again and retry.';
    } finally {
      this.ownedLoading = false;
    }
  }

  async revokeOwned(link: OwnedLink): Promise<void> {
    if (this.busy || !confirm('Revoke this link? Anyone who has it will no longer be able to open it.')) return;
    this.busy = link.id;
    try {
      await this.shl.revoke({id: link.id, ownerBound: true});
      await this.vault.markRevoked(link.id);
      await this.loadOwnedLinks();
      this.reload();
    } catch (err) {
      console.error('Link could not be revoked', err);
      this.ownedError = 'The link could not be revoked. Please try again.';
    } finally {
      this.busy = undefined;
    }
  }

  /** Issuer of a received card: its name if trusted, else its URL */
  issuerName(card: ReceivedHealthCard): string {
    return this.shlReader.trustedIssuer(card.issuer)?.name || card.issuer;
  }

  isTrusted(card: ReceivedHealthCard): boolean {
    return !!this.shlReader.trustedIssuer(card.issuer);
  }

  share(card: ReceivedHealthCard): void {
    this.sharing = {card, profiles: [this.receivedProfiles.profile(card)]};
  }

  /** Share dialog closed: links created from the received card are in the list now */
  sharingClosed(): void {
    this.sharing = undefined;
    this.reload();
  }

  async removeReceived(card: ReceivedHealthCard): Promise<void> {
    if (this.busy || !confirm('Remove this card from your list? Links you created from it keep working until they expire or you revoke them.')) return;
    this.busy = card.id;
    try {
      await this.vault.removeReceived(card.id);
      this.reload();
    } catch (err) {
      this.error = (err as Error)?.message || 'The card could not be removed.';
    } finally {
      this.busy = undefined;
    }
  }

  trackById(index: number, link: StoredLink): string {
    return link.id;
  }

  /** Account links that are not in the unlocked list (e.g. created on another device or before a reset) */
  get otherOwnedLinks(): OwnedLink[] {
    const known = new Set(this.links.map(link => link.id));
    return (this.ownedLinks || []).filter(link => !known.has(link.id));
  }

  reload(): void {
    this.links = this.vault.links;
    this.received = this.vault.received;
    if (!this.vault.isUnlocked) {
      this.shown = {};
    }
  }
}
