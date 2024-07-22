import {Signal} from "@angular/core";
import {FhirUtils} from "./fhir-utils";

export class CdsUtils {
  public static stateToPrefetch(state: any, conceptDefinitions: { id: string, value: Signal<any>, [key: string]: any }[], patient: fhir4.Patient, includePatient?: boolean) {
    const prefetch: any = {}
    Object.entries(state).map(([conceptId, value]) => {
      prefetch[conceptId] = FhirUtils.createBundle(
        <any>conceptDefinitions.find(_ => _.id === conceptId),
        <any>patient,
        <any>value);
    })
    if (includePatient) {
      prefetch.patient = patient
    }
    return prefetch
  }
}
