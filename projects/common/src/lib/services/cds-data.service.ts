import { Injectable } from '@angular/core';
import Client from "fhirclient/lib/Client";
import {PrefetchStateChangeOptions, StatefulCdsService} from "./stateful-cds.service";


@Injectable()
export class CdsDataService {
  conceptDefinitions: any[] = [];
  patient: fhir4.Patient|undefined;
  client: Client|undefined;
  Id: string = '';
  private initialized: Promise<void>|undefined;

  constructor(private statefulCdsService: StatefulCdsService) { }

  private async _init(client: Client, patient: fhir4.Patient | undefined, serviceId: string) {
    this.Id = serviceId;
    this.patient = patient;
    this.client = client;
    this.conceptDefinitions = await this.statefulCdsService?.createState({
      patient: this.patient,
      serviceId: this.Id,
      language: 'en',
      client: this.client
    }) || []
  }

  init(client: Client, patient: fhir4.Patient | undefined, serviceId: string) {
    if (!this.initialized) {
      this.initialized = this._init(client, patient, serviceId)
    }
    return this.initialized
  }

  resetState() {
    this.statefulCdsService?.resetState(this.conceptDefinitions)
  }

  onPrefetchStateChange(options: PrefetchStateChangeOptions) {
    if (!this.initialized) {
      throw new Error( this.Id + ' service should be initialized.')
    }
    this.statefulCdsService?.onPrefetchStateChange({
      patient: this.patient,
      serviceId: this.Id,
      language: 'en',
      client: this.client,
      onPrefetchStateChange: options
    })
  }

}
