import {Inject, Injectable, NgZone, Optional} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {SmartOnFhirService} from 'ng-smart-on-fhir';
import {HEALTH_CARD_CONFIG, HealthCardConfig} from './health-card.config';
import {SHLink, SHLinkCreateResponse, ShlApiService} from './shl-api.service';

/**
 * - unavailable: no FHIR server / patient context (e.g. an offline SHC session)
 * - none: no vault for the patient on this device yet
 * - locked / unlocked: the vault exists; its links are only readable while unlocked
 */
export type LinkVaultState = 'unavailable' | 'none' | 'locked' | 'unlocked';

/** A shared link kept in the vault */
export interface StoredLink {
  /** Link id on the SHL server */
  id: string;
  /**
   * What rebuilds the link: the SHL payload with its decryption key, the QR code and the management token.
   * Missing for links imported from the old unencrypted history, which cannot be shown again (only revoked).
   */
  link?: SHLinkCreateResponse;
  label?: string;
  /** What the link contains, e.g. a health card profile label */
  service?: string;
  createdAt: string;
  /** Expiration, epoch seconds */
  exp?: number;
  passcodeProtected: boolean;
  managementToken?: string;
  /** Bound to the user's account on the SHL server: revocable with the access token even without the vault */
  ownerBound?: boolean;
  revokedAt?: string;
}

/**
 * A SMART Health Card received from someone else (e.g. a care plan a clinician shared as a link), kept with its original
 * signature so that it can be shared again as signed by its issuer
 */
export interface ReceivedHealthCard {
  /** SHA-256 (hex) of the compact JWS */
  id: string;
  /** The original card (compact JWS) */
  jws: string;
  /** Issuer (iss) */
  issuer: string;
  /** Whether the signature was verified when the card was received */
  verified: boolean;
  /** Title: the link label, or the title of the card's Composition/CarePlan */
  label: string;
  /** Resource types in the card (Patient excluded) */
  resourceTypes: string[];
  /** Issuance time (nbf), ISO */
  issuedAt?: string;
  receivedAt: string;
}

/** Links imported into the vault from older, weaker storage */
export interface LinkImportResult {
  imported: number;
  /** Old encrypted entries that did not open with this password; they stay where they were */
  notImported: number;
}

export class WrongVaultPasswordError extends Error {
  constructor() {
    super('Wrong password.');
    this.name = 'WrongVaultPasswordError';
  }
}

interface VaultBlob {
  v: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

interface VaultContent {
  links: StoredLink[];
  /** Cards received from others */
  received?: ReceivedHealthCard[];
}

interface Scope {
  storageKey: string;
  fhirUrl: string;
  patientId: string;
}

interface Unlocked extends Scope {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  content: VaultContent;
}

interface LegacyChanges {
  remove: string[];
  rewrite: [string, string][];
}

/** OWASP (2023) recommendation for PBKDF2-HMAC-SHA256 */
const ITERATIONS = 600_000;
/** Iterations of the old shc-generator link store (imported on unlock) */
const LEGACY_ITERATIONS = 100_000;
const MIN_PASSWORD_LENGTH = 10;
const MAX_LINKS = 200;
const ACTIVITY_THROTTLE_MS = 15_000;

const utf8 = (text: string) => new TextEncoder().encode(text);
const fromUtf8 = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);
const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) { // chunks: spreading a large array into fromCharCode overflows the stack
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, material,
    {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']); // not extractable
}

/**
 * Shared SMART Health Links kept on this device, encrypted with a password, so that they can be shown (QR code, copy)
 * and revoked later; also the SMART Health Cards received from others (ReceivedHealthCard), to share them again. The links hold the decryption keys of the shared data, so they are never stored in the clear
 * and the SHL server never learns them.
 *
 * - One vault per patient and FHIR server; its localStorage key is a hash, so it does not reveal the patient or server.
 * - AES-256-GCM with a key derived from the password with PBKDF2-SHA-256 (600,000 iterations, random salt); a new IV on
 *   every save; the storage key is authenticated data, so a vault copied under another key does not open.
 * - The key is not extractable and is only kept in memory while unlocked; the vault locks itself after a period of
 *   inactivity (HealthCardConfig.linkVaultAutoLockMinutes) and when another tab changes it.
 * - On the first unlock, links of the old unencrypted history and of the old shc-generator store are imported and removed.
 *
 * A forgotten password cannot be recovered: reset() deletes the vault. Links bound to the user's account
 * (HealthCardConfig.shlOwnerAuth) can still be listed and revoked with ShlApiService.ownedLinks() / revoke().
 */
@Injectable({
  providedIn: 'root'
})
export class SharedLinkVaultService {

  /** Prefix of the localStorage keys of the vaults (kept on logout, see SmartOnFhirConfig.keepOnLogout) */
  static readonly STORAGE_PREFIX = 'shl-vault.';

  static readonly MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;

  readonly state$ = new BehaviorSubject<LinkVaultState>('unavailable');

  private unlocked?: Unlocked;
  private readonly autoLockMs: number;
  private lockTimer?: ReturnType<typeof setTimeout>;
  private lastActivity = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private sof: SmartOnFhirService, private shl: ShlApiService, private zone: NgZone,
              @Optional() @Inject(HEALTH_CARD_CONFIG) config?: HealthCardConfig) {
    this.autoLockMs = Math.max(1, config?.linkVaultAutoLockMinutes ?? 10) * 60_000;
    if (typeof window !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        ['pointerdown', 'keydown'].forEach(type =>
          window.addEventListener(type, () => this.onActivity(), {passive: true, capture: true}));
        window.addEventListener('storage', event => {
          if (this.unlocked && event.key === this.unlocked.storageKey) {
            this.zone.run(() => this.lock()); // changed in another tab: the links in memory are outdated
          }
        });
      });
    }
    this.refresh();
  }

  get state(): LinkVaultState {
    return this.state$.value;
  }

  get isUnlocked(): boolean {
    return !!this.unlocked;
  }

  /** Links of the unlocked vault, newest first (empty while locked) */
  get links(): StoredLink[] {
    return this.unlocked ? this.unlocked.content.links.map(link => ({...link})) : [];
  }

  /** Cards received from others in the unlocked vault, newest first (empty while locked) */
  get received(): ReceivedHealthCard[] {
    return this.unlocked ? (this.unlocked.content.received || []).map(card => ({...card})) : [];
  }

  /** Why a new password is not accepted, or undefined */
  static passwordProblem(password: string): string | undefined {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (/^(.)\1*$/.test(password) || new Set(password).size < 4) {
      return 'This password is too easy to guess.';
    }
    return undefined;
  }

  static status(link: StoredLink): 'revoked' | 'expired' | 'active' {
    if (link.revokedAt) return 'revoked';
    return link.exp && link.exp * 1000 <= Date.now() ? 'expired' : 'active';
  }

  /** Rebuild a stored link (QR code, copy); undefined for links imported without their key */
  static toSHLink(link: StoredLink): SHLink | undefined {
    return link.link ? new SHLink(link.link, link.service) : undefined;
  }

  /** Update the state for the current patient / FHIR server (locks the vault if the context changed) */
  async refresh(): Promise<LinkVaultState> {
    const scope = await this.scope();
    if (this.unlocked && this.unlocked.storageKey !== scope?.storageKey) {
      this.lock();
    }
    if (!this.unlocked) {
      this.setState(!scope ? 'unavailable' : this.readBlob(scope.storageKey) ? 'locked' : 'none');
    }
    return this.state;
  }

  /** Create the vault with a new password and import the links of the older storage */
  create(password: string): Promise<LinkImportResult> {
    return this.serialized(async () => {
      const problem = SharedLinkVaultService.passwordProblem(password);
      if (problem) {
        throw new Error(problem);
      }
      const scope = await this.requireScope();
      if (this.readBlob(scope.storageKey)) {
        throw new Error('A link vault already exists on this device; unlock it instead.');
      }
      const salt = random(16);
      const unlocked: Unlocked = {...scope, key: await deriveKey(password, salt, ITERATIONS), salt, iterations: ITERATIONS, content: {links: [], received: []}};
      return this.open(unlocked, password, true);
    });
  }

  /** Unlock the vault; throws WrongVaultPasswordError */
  unlock(password: string): Promise<LinkImportResult> {
    return this.serialized(async () => {
      const scope = await this.requireScope();
      const blob = this.readBlob(scope.storageKey);
      if (!blob) {
        throw new Error('There is no link vault on this device.');
      }
      const salt = fromBase64(blob.salt);
      const key = await deriveKey(password, salt, blob.iterations);
      const content = await this.decrypt(blob, key, scope.storageKey);
      const unlocked: Unlocked = {...scope, key, salt, iterations: blob.iterations, content};
      let changed = false;
      if (blob.iterations < ITERATIONS) { // strengthen vaults written with fewer iterations
        unlocked.salt = random(16);
        unlocked.key = await deriveKey(password, unlocked.salt, ITERATIONS);
        unlocked.iterations = ITERATIONS;
        changed = true;
      }
      return this.open(unlocked, password, changed);
    });
  }

  /** Forget the key and the links in memory */
  lock() {
    clearTimeout(this.lockTimer);
    const storageKey = this.unlocked?.storageKey;
    this.unlocked = undefined;
    if (storageKey) {
      this.setState(this.readBlob(storageKey) ? 'locked' : 'none');
    }
  }

  /** Keep a newly created link */
  add(link: SHLink): Promise<void> {
    return this.serialized(async () => {
      const unlocked = this.requireUnlocked();
      const stored: StoredLink = {
        id: link.id || toBase64(random(16)),
        link: link.toJSON(),
        label: link.label,
        service: link.serviceId,
        createdAt: new Date().toISOString(),
        exp: link.exp ? Math.floor(link.exp.getTime() / 1000) : undefined,
        passcodeProtected: link.isPasswordProtected,
        managementToken: link.managementToken,
        ownerBound: link.ownerBound
      };
      unlocked.content.links = [stored, ...unlocked.content.links.filter(other => other.id !== stored.id)].slice(0, MAX_LINKS);
      await this.save();
    });
  }

  /** Keep cards received from others (a card kept before is replaced) */
  addReceived(cards: ReceivedHealthCard[]): Promise<void> {
    return this.serialized(async () => {
      const unlocked = this.requireUnlocked();
      const ids = new Set(cards.map(card => card.id));
      unlocked.content.received = [...cards, ...(unlocked.content.received || []).filter(card => !ids.has(card.id))].slice(0, MAX_LINKS);
      await this.save();
    });
  }

  /** Remove a received card */
  removeReceived(id: string): Promise<void> {
    return this.serialized(async () => {
      const unlocked = this.requireUnlocked();
      unlocked.content.received = (unlocked.content.received || []).filter(card => card.id !== id);
      await this.save();
    });
  }

  /** Revoke a stored link on the SHL server and mark it revoked */
  revoke(id: string): Promise<void> {
    return this.serialized(async () => {
      const stored = this.requireUnlocked().content.links.find(link => link.id === id);
      if (!stored) {
        throw new Error('Unknown link.');
      }
      await this.shl.revoke(stored);
      await this.markRevokedNow(id);
    });
  }

  /** Mark a link revoked elsewhere (e.g. from the share dialog); no-op while locked */
  markRevoked(id: string): Promise<void> {
    return this.serialized(() => this.unlocked ? this.markRevokedNow(id) : Promise.resolve());
  }

  /** Remove a link from the vault (it is not revoked) */
  remove(id: string): Promise<void> {
    return this.serialized(async () => {
      const unlocked = this.requireUnlocked();
      unlocked.content.links = unlocked.content.links.filter(link => link.id !== id);
      await this.save();
    });
  }

  /** Re-encrypt the vault with a new password */
  changePassword(current: string, next: string): Promise<void> {
    return this.serialized(async () => {
      const unlocked = this.requireUnlocked();
      const problem = SharedLinkVaultService.passwordProblem(next);
      if (problem) {
        throw new Error(problem);
      }
      const blob = this.readBlob(unlocked.storageKey);
      if (blob) { // proves the current password
        await this.decrypt(blob, await deriveKey(current, fromBase64(blob.salt), blob.iterations), unlocked.storageKey);
      }
      unlocked.salt = random(16);
      unlocked.key = await deriveKey(next, unlocked.salt, ITERATIONS);
      unlocked.iterations = ITERATIONS;
      await this.save();
    });
  }

  /** Delete the vault of the current patient (e.g. forgotten password); the links stay active on the SHL server */
  reset(): Promise<void> {
    return this.serialized(async () => {
      const scope = await this.requireScope();
      this.lock();
      localStorage.removeItem(scope.storageKey);
      this.setState('none');
    });
  }

  /** Number of links waiting in the older storage (imported when the vault is created or unlocked) */
  async legacyCount(): Promise<number> {
    const scope = await this.scope();
    if (!scope) {
      return 0;
    }
    let count = this.readLegacyHistory(scope).length;
    this.legacyStoreKeys(scope).forEach(key => count += this.parseArray(localStorage.getItem(key)).length);
    return count;
  }

  private async open(unlocked: Unlocked, password: string, changed: boolean): Promise<LinkImportResult> {
    this.unlocked = unlocked;
    try {
      const {result, changes} = await this.importLegacy(unlocked, password);
      if (changed || result.imported || !this.readBlob(unlocked.storageKey)) {
        await this.save();
      }
      changes.remove.forEach(key => localStorage.removeItem(key)); // only once the imported links are saved encrypted
      changes.rewrite.forEach(([key, value]) => localStorage.setItem(key, value));
      this.setState('unlocked');
      this.touch();
      return result;
    } catch (err) {
      this.unlocked = undefined;
      throw err;
    }
  }

  private async markRevokedNow(id: string) {
    const unlocked = this.requireUnlocked();
    const stored = unlocked.content.links.find(link => link.id === id);
    if (stored && !stored.revokedAt) {
      stored.revokedAt = new Date().toISOString();
      await this.save();
    }
  }

  private async save() {
    const unlocked = this.requireUnlocked();
    const iv = random(12);
    const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: utf8(unlocked.storageKey)},
      unlocked.key, utf8(JSON.stringify(unlocked.content)));
    const blob: VaultBlob = {
      v: 1, kdf: 'PBKDF2-SHA-256', iterations: unlocked.iterations,
      salt: toBase64(unlocked.salt), iv: toBase64(iv), data: toBase64(new Uint8Array(data))
    };
    try {
      localStorage.setItem(unlocked.storageKey, JSON.stringify(blob));
    } catch (err) {
      throw new Error('The shared links could not be saved on this device (browser storage is full or disabled).');
    }
    this.touch();
  }

  private async decrypt(blob: VaultBlob, key: CryptoKey, storageKey: string): Promise<VaultContent> {
    try {
      const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromBase64(blob.iv), additionalData: utf8(storageKey)},
        key, fromBase64(blob.data));
      const content = JSON.parse(fromUtf8(plain));
      return {
        links: Array.isArray(content?.links) ? content.links : [],
        received: Array.isArray(content?.received) ? content.received : []
      };
    } catch {
      throw new WrongVaultPasswordError(); // AES-GCM authentication fails with a wrong key
    }
  }

  /** Links of the old unencrypted history and of the old shc-generator store (per link encryption, 100,000 iterations) */
  private async importLegacy(unlocked: Unlocked, password: string): Promise<{ result: LinkImportResult, changes: LegacyChanges }> {
    const changes: LegacyChanges = {remove: [], rewrite: []};
    const found: StoredLink[] = [];
    let notImported = 0;

    const history = this.readLegacyHistory(unlocked);
    if (history.length) {
      history.filter(record => typeof record?.id === 'string').forEach(record => found.push({
        id: record.id,
        label: record.label,
        service: record.service,
        createdAt: record.createdAt || new Date().toISOString(),
        exp: record.exp,
        passcodeProtected: !!record.passcodeProtected,
        managementToken: record.managementToken,
        revokedAt: record.revokedAt
      }));
    }
    if (localStorage.getItem(this.legacyHistoryKey(unlocked)) !== null) {
      changes.remove.push(this.legacyHistoryKey(unlocked));
    }

    for (const key of this.legacyStoreKeys(unlocked)) {
      const service = key.substring((unlocked.patientId + '.' + unlocked.fhirUrl + '.').length) || undefined;
      const failed: unknown[] = [];
      for (const entry of this.parseArray(localStorage.getItem(key))) {
        try {
          const link = new SHLink(JSON.parse(await SharedLinkVaultService.legacyDecrypt(entry, password)), service);
          if (link.id) {
            found.push({
              id: link.id, link: link.toJSON(), label: link.label, service,
              createdAt: new Date().toISOString(),
              exp: link.exp ? Math.floor(link.exp.getTime() / 1000) : undefined,
              passcodeProtected: link.isPasswordProtected, managementToken: link.managementToken
            });
          }
        } catch {
          failed.push(entry);
        }
      }
      notImported += failed.length;
      if (failed.length) {
        changes.rewrite.push([key, JSON.stringify(failed)]);
      } else {
        changes.remove.push(key);
      }
    }

    const known = new Set(unlocked.content.links.map(link => link.id));
    const imported = found.filter(link => !known.has(link.id) && known.add(link.id));
    unlocked.content.links = [...unlocked.content.links, ...imported]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, MAX_LINKS);
    return {result: {imported: imported.length, notImported}, changes};
  }

  private static async legacyDecrypt(entry: any, password: string): Promise<string> {
    if (!entry?.cipherText || !entry?.salt || !entry?.iv) {
      throw new Error('Not an encrypted link.');
    }
    const key = await deriveKey(password, fromBase64(entry.salt), LEGACY_ITERATIONS);
    return fromUtf8(await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromBase64(entry.iv)}, key, fromBase64(entry.cipherText)));
  }

  private legacyHistoryKey(scope: Scope): string {
    return ['shl-shared-links', scope.fhirUrl, scope.patientId].join('|');
  }

  private readLegacyHistory(scope: Scope): any[] {
    return this.parseArray(localStorage.getItem(this.legacyHistoryKey(scope)));
  }

  /** Keys of the old shc-generator store: <patientId>.<fhirUrl>.<serviceId> */
  private legacyStoreKeys(scope: Scope): string[] {
    const prefix = scope.patientId + '.' + scope.fhirUrl + '.';
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys;
  }

  private parseArray(value: string | null): any[] {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private readBlob(storageKey: string): VaultBlob | undefined {
    try {
      const blob = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return blob?.v === 1 && blob.salt && blob.iv && blob.data && blob.iterations ? blob : undefined;
    } catch {
      return undefined;
    }
  }

  private async scope(): Promise<Scope | undefined> {
    const client = await this.sof.getClient().catch(() => undefined);
    const patient = await this.sof.getPatient().catch(() => undefined);
    const fhirUrl = client?.state?.serverUrl;
    const patientId = patient?.id;
    if (!fhirUrl || !patientId || typeof localStorage === 'undefined' || !crypto?.subtle) {
      return undefined;
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8('shl-vault|' + fhirUrl + '|' + patientId)));
    const id = toBase64(digest).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_').substring(0, 32);
    return {storageKey: SharedLinkVaultService.STORAGE_PREFIX + id, fhirUrl, patientId};
  }

  private async requireScope(): Promise<Scope> {
    const scope = await this.scope();
    if (!scope) {
      throw new Error('Shared links can only be kept for a patient on a FHIR server.');
    }
    return scope;
  }

  private requireUnlocked(): Unlocked {
    if (!this.unlocked) {
      throw new Error('Unlock your shared links first.');
    }
    return this.unlocked;
  }

  /** Run vault changes one at a time */
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private setState(state: LinkVaultState) {
    if (this.state$.value !== state) {
      this.zone.run(() => this.state$.next(state));
    }
  }

  private onActivity() {
    if (this.unlocked && Date.now() - this.lastActivity > ACTIVITY_THROTTLE_MS) {
      this.touch();
    }
  }

  /** (Re)start the auto-lock timer */
  private touch() {
    this.lastActivity = Date.now();
    clearTimeout(this.lockTimer);
    this.zone.runOutsideAngular(() => {
      this.lockTimer = setTimeout(() => this.zone.run(() => this.lock()), this.autoLockMs);
    });
  }
}
