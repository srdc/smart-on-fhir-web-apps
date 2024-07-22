import {Injectable} from '@angular/core';
import * as FHIR from 'fhirclient'
import Client from "fhirclient/lib/Client";

@Injectable({
  providedIn: 'root'
})
export class SmartOnFhirService {

  private client$ = FHIR.oauth2.ready()

  constructor() {
  }

  private async ready<T>(callback: (client: Client) => Promise<T>): Promise<T> {
    return callback(await this.client$)
  }

  getPatient() {
    return this.ready<fhir4.Patient>(client => client.patient.read())
  }

  search<T>(resourceType: string, ...params: any[]): Promise<fhir4.Bundle<T>> {
    return this.ready<fhir4.Bundle<T>>(client => client.request({
      url: this.constructQueryURL(resourceType, params)
    }))
  }

  request<T>(url: string): Promise<fhir4.Bundle<T>> {
    return this.ready<fhir4.Bundle<T>>(client => client.request({
      url: url + (url.includes('Observation') ? '&_count=999' : '')
    }))
  }

  private constructQueryURL(resourceType: string, params?: { [key: string]: string|number }[]) {
    return resourceType + '?' + (params?.map(_params =>
      Object.keys(_params).map(key => key + '=' + _params[key]).join('&')
    ).filter(_ => _).join('&') || '');
  }
}
