import {Component, EventEmitter, Input, Output} from '@angular/core';
import {LinkImportResult, SharedLinkVaultService, WrongVaultPasswordError} from '../../services/shared-link-vault.service';

/**
 * Password form of the shared link vault: creates it (new password + confirmation) when there is none on this device,
 * otherwise unlocks it
 */
@Component({
  selector: 'app-link-vault-form',
  templateUrl: './link-vault-form.component.html'
})
export class LinkVaultFormComponent {

  /** Show "Forgot password?" in unlock mode */
  @Input() allowReset = false;
  /** Label of the submit button, e.g. "Unlock and save" */
  @Input() submitLabel?: string;
  @Input() compact = false;
  @Output() opened = new EventEmitter<LinkImportResult>();
  @Output() forgot = new EventEmitter<void>();

  password = '';
  confirmation = '';
  showPassword = false;
  busy = false;
  error?: string;
  readonly minLength = SharedLinkVaultService.MIN_PASSWORD_LENGTH;
  /** Random id prefix, so that several forms on a page keep unique ids */
  readonly uid = 'vault-' + Math.random().toString(36).substring(2, 8);

  constructor(public vault: SharedLinkVaultService) {
  }

  get creating(): boolean {
    return this.vault.state === 'none';
  }

  async submit(): Promise<void> {
    if (this.busy) return;
    this.error = undefined;
    if (this.creating) {
      const problem = SharedLinkVaultService.passwordProblem(this.password);
      if (problem) {
        this.error = problem;
        return;
      }
      if (this.password !== this.confirmation) {
        this.error = 'The passwords do not match.';
        return;
      }
    }
    this.busy = true;
    try {
      const result = this.creating ? await this.vault.create(this.password) : await this.vault.unlock(this.password);
      this.password = this.confirmation = '';
      this.opened.emit(result);
    } catch (err) {
      this.error = err instanceof WrongVaultPasswordError ? 'Wrong password.'
        : (err as Error)?.message || 'Your shared links could not be opened.';
    } finally {
      this.busy = false;
    }
  }
}
