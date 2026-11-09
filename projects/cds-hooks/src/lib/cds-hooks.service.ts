import {Inject, Injectable} from '@angular/core';
import {CDSHooks} from "./model/cds";
import {HttpClient, HttpHeaders} from "@angular/common/http";
import {first, lastValueFrom} from "rxjs";
import { v4 as uuidv4 } from "uuid";
import {CdsStore} from "./cds-store";

export interface CustomSort<T> {
  custom: (resource1: T, resource2: T) => number;
}

export interface PathSort<T> {
  pathEvaluator: (resource: T, path: string, ...args: any[]) => any;
  paths: {[resourceType: string]: string|string[]};
  evaluatorArgs?: any[];
  ascending: boolean;
}

export type SortingConfig<T> = (CustomSort<T>|PathSort<T>)

export interface CdsHooksServiceConfig<T> {
  // CDS server: <baseUrl>/cds-hooks/cds-services
  baseUrl: string;
  // CDS server per FHIR server (the fhirServer of the call, e.g. the repository the user is logged in to); calls with
  // another or no fhirServer go to baseUrl. The STAGE repositories serve their CDS services at <FHIR base>/cds-hooks.
  baseUrls?: {[fhirServer: string]: string};
  sort?: SortingConfig<T>;
}

@Injectable()
export class CdsHooksService<T extends { resourceType: string, id?: string }> extends CdsStore<T> {

  private services: {[serviceId: string]: CDSHooks.DiscoveryResponse} = {};
  private loadDefinitions: Promise<any>|undefined;
  private baseUrl: string = '';

  constructor( @Inject('cdsConfig') protected override config: CdsHooksServiceConfig<T>, private http: HttpClient) {
    super(config)
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.loadDefinitions = new Promise<void>((resolve, reject) =>
      this.http.get(`${this.baseUrl}/cds-hooks/cds-services/`).pipe(first()).subscribe({
        next: (value: Object) => {
          (<{services: CDSHooks.DiscoveryResponse[]}>value).services.forEach(service => {
            this.services[service.id] = service;
          })
          resolve();
        },
        error: (error) => {
          reject(error);
        }
      })
    );
  }

  async getServiceDefinition(serviceId: string): Promise<CDSHooks.DiscoveryResponse|null> {
    await this.loadDefinitions;
    if (!this.services[serviceId]) {
      return null;
    }
    return this.services[serviceId];
  }

  async listServices(): Promise<string[]> {
    await this.loadDefinitions;
    return Object.keys(this.services || {});
  }

  async callService(params: { serviceId: string, context: {[key: string]: any}, prefetch: {[key: string]: any},
                    language?: string, fhirServer?: string, fhirAuthorization?: CDSHooks.FhirAuthorization}): Promise<any> {
    await this.loadDefinitions;
    if (!this.services[params.serviceId]) {
      return null;
    }

    const request: CDSHooks.ServiceRequest =  {
      hook: this.services[params.serviceId].hook,
      hookInstance: uuidv4(),
      context: params.context || {},
      prefetch: params.prefetch || {}
    }

    if (params.fhirServer) request.fhirServer = params.fhirServer
    if (params.fhirAuthorization) request.fhirAuthorization = params.fhirAuthorization

    return await lastValueFrom(this.http.post(`${this.getBaseUrl(params.fhirServer)}/cds-hooks/cds-services/${params.serviceId}`, request, params.language ? {
      headers: new HttpHeaders({ 'Accept-Language': params.language })
    } : undefined))
  }

  /** CDS server for the given FHIR server (baseUrls), or the default one */
  private getBaseUrl(fhirServer?: string): string {
    const normalize = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();
    const match = fhirServer ? Object.entries(this.config.baseUrls || {}).find(([fhir]) => normalize(fhir) === normalize(fhirServer)) : undefined;
    return match ? match[1].replace(/\/$/, '') : this.baseUrl;
  }

}
