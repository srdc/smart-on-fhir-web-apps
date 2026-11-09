import {Inject, Injectable, Optional} from '@angular/core';
import {SmartOnFhirService} from "ng-smart-on-fhir";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {HEALTH_CARD_CONFIG, HealthCardConfig} from "./health-card.config";

/** SHL payload (the JSON encoded in a shlink:/ URI) */
export interface SHLinkManifest {
  url: string;
  key: string;
  exp?: number;   // epoch seconds
  flag?: string;  // L, P, U in alphabetical order, e.g. 'LP'
  label?: string; // max len: 80
  v?: number;
}

/** Response of the SHL server's create endpoint (also what the link vault keeps to rebuild a link) */
export interface SHLinkCreateResponse {
  manifest: SHLinkManifest;
  /** Link id on the SHL server */
  id?: string;
  /** shlink:/ URI built by the server */
  shlink?: string;
  qr: string;
  /** Bearer token for revoking the link (DELETE on the SHL server) */
  managementToken?: string;
  /** Whether the server bound the link to the user's account (owner), see HealthCardConfig.shlOwnerAuth */
  ownerBound?: boolean;
}

/** Link options of the SHL server */
export interface SHLinkOptions {
  passcode?: string;
  /** Expiration as epoch seconds */
  exp?: number;
  /** Long-term link (flag L): receivers may poll it */
  longTerm?: boolean;
}

/** Content shared through a link: SMART Health Cards and/or plain FHIR resources (application/fhir+json, not signed) */
export interface SharedContent {
  verifiableCredentials?: string[];
  fhir?: fhir4.Resource[];
}

/** What a revoke needs: the link id and its management token, or a link bound to the user's account */
export interface RevocableLink {
  id?: string;
  managementToken?: string;
  ownerBound?: boolean;
}

/** A link bound to the user's account, as listed by the SHL server (metadata only: it cannot be opened from this) */
export interface OwnedLink {
  id: string;
  label?: string;
  createdAt?: string;
  /** Expiration, epoch seconds */
  exp?: number;
  flag?: string;
  active: boolean;
  revokedAt?: string;
}

/** UTF-8 safe base64url (btoa alone fails on non Latin-1 labels, e.g. "Yılmaz") */
function base64UrlJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export class SHLink {

  private _manifest: SHLinkManifest;
  private _qr: string;
  private _link: string;
  private _copied: boolean = false;
  private _serviceId: string|undefined;
  private _id: string|undefined;
  private _managementToken: string|undefined;
  private _ownerBound: boolean;
  nbf: Date|undefined;
  exp: Date|undefined;
  needPasscode?: string;
  passcode?: string;

  get serviceId() {
    return this._serviceId;
  }

  get copied(): boolean {
    return this._copied;
  }

  get label() {
    return this._manifest.label;
  }

  get url() {
    return this._manifest.url;
  }

  get link(): string {
    return this._link;
  }

  get isPasswordProtected() {
    return !!this._manifest.flag?.includes('P');
  }

  get qr(): string {
    return this._qr;
  }

  /** Link id on the SHL server (from the manifest URL .../shl/<id>/m) */
  get id(): string|undefined {
    return this._id;
  }

  /** Token for revoking the link; only known to the app that created it */
  get managementToken(): string|undefined {
    return this._managementToken;
  }

  /** Whether the link is bound to the user's account on the SHL server (revocable with the user's access token) */
  get ownerBound(): boolean {
    return this._ownerBound;
  }

  get expired(): boolean {
    return !!this.exp && this.exp.getTime() <= Date.now();
  }

  revoked = false;

  constructor(resp: SHLinkCreateResponse, serviceId?: string) {
    this._manifest = resp.manifest;
    this._qr = resp.qr;
    this._id = resp.id || this._manifest?.url?.match(/\/shl\/([A-Za-z0-9_-]{43})\/m$/)?.[1];
    this._managementToken = resp.managementToken;
    this._ownerBound = !!resp.ownerBound;
    this._link = resp.shlink || 'shlink:/' + base64UrlJson(this._manifest);
    this.exp = this._manifest?.exp ? new Date(this._manifest.exp * 1000) : undefined;
    this._serviceId = serviceId;
  }

  /** What is needed to rebuild the link later (the link vault stores it encrypted) */
  toJSON(): SHLinkCreateResponse {
    return {manifest: this._manifest, id: this._id, shlink: this._link, qr: this._qr,
      managementToken: this._managementToken, ownerBound: this._ownerBound};
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.link).then(() => {
      this._copied = true;
      setTimeout(() => this._copied = false, 2000); // Reset after 2 seconds
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }
}

/**
 * Client of the SMART Health Links server: create links and revoke them. Links are kept (encrypted, on this device)
 * by SharedLinkVaultService; with HealthCardConfig.shlOwnerAuth, links are also bound to the user's account so that
 * they can be listed and revoked with the user's access token when the vault is lost.
 */
@Injectable({
  providedIn: 'root'
})
export class ShlApiService {

  private patient: fhir4.Patient|undefined;

  private readonly defaultShlServerBaseUrl: string | undefined;
  private readonly ownerAuth: boolean;
  /** FHIR server of the session, to pick its SHL server from HealthCardConfig.shlServerBaseUrls */
  private fhirServerUrl: string | undefined;

  constructor(private sof: SmartOnFhirService, private http: HttpClient,
              @Optional() @Inject(HEALTH_CARD_CONFIG) private config?: HealthCardConfig) {
    this.defaultShlServerBaseUrl = config?.shlServerBaseUrl?.replace(/\/+$/, '');
    this.ownerAuth = !!config?.shlOwnerAuth;
    this.sof.getPatient().then(patient => this.patient = patient).catch(() => undefined);
    this.sof.getClient().then(client => this.fhirServerUrl = client?.state.serverUrl).catch(() => undefined);
  }

  /** SHL server of the FHIR server of the session (HealthCardConfig.shlServerBaseUrls), else the default one */
  private get shlServerBaseUrl(): string | undefined {
    const normalize = (url: string) => url.replace(/\/+$/, '');
    const servers = this.config?.shlServerBaseUrls || {};
    const key = this.fhirServerUrl ? Object.keys(servers).find(fhir => normalize(fhir) === normalize(this.fhirServerUrl!)) : undefined;
    return key ? normalize(servers[key]) : this.defaultShlServerBaseUrl;
  }

  /** Whether an SHL server is configured */
  get enabled(): boolean {
    return !!this.shlServerBaseUrl;
  }

  /** Whether links are bound to the user's account on the SHL server (listed and revoked with the access token) */
  get ownerAuthEnabled(): boolean {
    return this.enabled && this.ownerAuth;
  }

  /**
   * Create a SMART Health Link on the SHL server
   * @param content - issued SMART Health Cards (compact JWS), and/or FHIR resources shared as application/fhir+json
   * @param service - what the link contains (e.g. IPS, CarePlan, a CDS service id); used in the label
   * @param passcode - optional passcode protecting the link (flag P)
   * @param options - expiration and long-term (flag L) options
   */
  async create(content: string[] | SharedContent, service: string, passcode?: string, options?: Omit<SHLinkOptions, 'passcode'>): Promise<SHLink> {
    if (!this.shlServerBaseUrl) {
      throw new Error('SMART Health Links server is not configured (environment.smart.shlServerBaseUrl).');
    }
    const {verifiableCredentials, fhir} = Array.isArray(content) ? {verifiableCredentials: content, fhir: undefined} : content;
    if (!verifiableCredentials?.length && !fhir?.length) {
      throw new Error('Nothing to share.');
    }
    const patientName = this.patient?.name?.at(0);
    const name = patientName?.text || [...(patientName?.given || []), patientName?.family].filter(part => !!part).join(' ');
    const response: SHLinkCreateResponse = await firstValueFrom<SHLinkCreateResponse>(
      this.http.post<SHLinkCreateResponse>(this.shlServerBaseUrl + '/shl/create', {
        shc: verifiableCredentials?.length ? {verifiableCredential: verifiableCredentials} : undefined,
        fhir: fhir?.length ? fhir : undefined,
        label: ((name ? name + "'s " : '') + 'data for ' + service).substring(0, 80), // SHL label max length is 80
        passcode: passcode || undefined,
        exp: options?.exp,
        flag: options?.longTerm ? 'L' : undefined
      }, {headers: await this.ownerHeaders()}));
    // never hand out an unprotected link when a passcode was asked for (e.g. an outdated SHL server ignoring it)
    if (passcode && !response.manifest?.flag?.includes('P')) {
      throw new Error('The SMART Health Links server did not apply the passcode (flag P missing); the link was not shared. Update the SHL server.');
    }
    return new SHLink(response, service);
  }

  /**
   * Revoke a link on the SHL server (its manifest and files answer 404 afterwards, and the server deletes the files):
   * with its management token, or with the user's access token for a link bound to the account.
   * A link the server no longer knows counts as revoked.
   */
  async revoke(link: RevocableLink): Promise<void> {
    if (!this.shlServerBaseUrl) {
      throw new Error('SMART Health Links server is not configured (environment.smart.shlServerBaseUrl).');
    }
    const token = link.managementToken || await this.accessToken();
    if (!link.id || !token) {
      throw new Error('This link cannot be revoked from here: its management token is not known.');
    }
    try {
      await firstValueFrom(this.http.delete(`${this.shlServerBaseUrl}/shl/${link.id}`, {
        headers: {Authorization: 'Bearer ' + token}
      }));
    } catch (err: any) {
      if (err?.status !== 404) {
        throw err;
      }
    }
    if (link instanceof SHLink) {
      link.revoked = true;
    }
  }

  /** Links bound to the user's account on the SHL server, newest first (empty when owners are not enabled) */
  async ownedLinks(): Promise<OwnedLink[]> {
    const token = this.ownerAuthEnabled ? await this.accessToken() : undefined;
    if (!token) {
      return [];
    }
    return firstValueFrom(this.http.get<OwnedLink[]>(`${this.shlServerBaseUrl}/shl/owned`, {
      headers: {Authorization: 'Bearer ' + token}
    }));
  }

  /** The SMART app's access token, sent to the SHL server only when owner authentication is enabled */
  private async accessToken(): Promise<string | undefined> {
    if (!this.ownerAuth) {
      return undefined;
    }
    const client = await this.sof.getClient().catch(() => undefined);
    return client?.state?.tokenResponse?.access_token || undefined;
  }

  private async ownerHeaders(): Promise<{ [header: string]: string }> {
    const token = await this.accessToken();
    return token ? {Authorization: 'Bearer ' + token} : {};
  }
}
