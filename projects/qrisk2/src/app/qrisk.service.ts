import { Injectable } from '@angular/core';
import Client from "fhirclient/lib/Client";
import {PrefetchStateChangeOptions, CdsUtils, StatefulCdsService} from "common";

@Injectable()
export class QriskService {
  conceptDefinitions: any[] = [];
  patient: fhir4.Patient|undefined;
  client: Client|undefined;
  private initialized: Promise<void>|undefined;

  constructor(private statefulCdsService: StatefulCdsService) { }

  private async _init(client: Client, patient: fhir4.Patient | undefined) {
    this.patient = patient;
    this.client = client;
    this.conceptDefinitions = await this.statefulCdsService?.createState({
      patient: this.patient,
      serviceId: 'qrisk',
      language: 'en',
      client: this.client
    }) || []
  }

  init(client: Client, patient: fhir4.Patient | undefined) {
    if (!this.initialized) {
      this.initialized = this._init(client, patient)
    }
    return this.initialized
  }

  resetState() {
    this.statefulCdsService?.resetState(this.conceptDefinitions)
  }

  onPrefetchStateChange(options: PrefetchStateChangeOptions) {
    if (!this.initialized) {
      throw new Error('Qrisk service should be initialized.')
    }
    this.statefulCdsService?.onPrefetchStateChange({
      patient: this.patient,
      serviceId: 'qrisk',
      language: 'en',
      client: this.client,
      onPrefetchStateChange: options
    })
  }

}
