import {Signal} from "@angular/core";

export class FhirUtils {
  public static createBundle(conceptDefinition: { id: string, value: Signal<any>, [key: string]: any },
                             patient: fhir4.Patient,
                             data: { value: any, resources: fhir4.Resource[] }) {
    if (!conceptDefinition) return;
    const bundle = <fhir4.Bundle>{
      resourceType: 'Bundle',
      id: Date.now() + '-bundle',
      total: 0,
      type: 'searchset',
      entry: []
    }
    switch (conceptDefinition['resourceType']) {
      case 'Condition':
        if (data.value?.value) {
          bundle.entry?.push({
            resource: <fhir4.Condition>{
              resourceType: 'Condition',
              id: Date.now() + '-condition',
              onsetDateTime: new Date().toISOString(),
              code: { coding: [ conceptDefinition['select'] ? data?.value?.selected : conceptDefinition['code'] ]},
              clinicalStatus: {
                coding: [{
                  code: 'active',
                  system: 'http://terminology.hl7.org/CodeSystem/condition-clinical'
                }]
              },
              subject: { reference: 'Patient/' + patient?.id }
            }
          })
        }
        break;
      case 'MedicationStatement':
        if (data.value?.value) {
          bundle.entry?.push({
            resource: <fhir4.MedicationStatement>{
              resourceType: 'MedicationStatement',
              id: Date.now() + '-MedicationStatement',
              date: new Date().toISOString(),
              medicationCodeableConcept: { coding: [ conceptDefinition['select'] ? data?.value?.selected : conceptDefinition['code'] ]},
              status: 'active',
              subject: { reference: 'Patient/' + patient?.id }
            }
          })
        }
        break;
      case 'Observation':
        const observation = <fhir4.Observation>{
          resourceType: 'Observation',
          id: Date.now() + '-observation',
          effectiveDateTime: new Date().toISOString(),
          code: { coding: [ conceptDefinition['code'] ]},
          category: [{ coding: [{ code: 'vital-sign', system: 'http://terminology.hl7.org/CodeSystem/observation-category' }] }],
          status: 'final',
          subject: { reference: 'Patient/' + patient?.id }
        }

        if (conceptDefinition['type'] === 'Quantity' && data?.value?.value) {
          observation.valueQuantity = {
            value: data.value.value,
            unit: data.value.unit || '1',
            code: data.value.unit || '1',
            system: 'ucum'
          }
          bundle.entry?.push({ resource: observation })
        } else if (conceptDefinition['type'] === 'CodeableConcept' && data?.value) {
          observation.valueCodeableConcept = {
            coding: [ data?.value ]
          }
          bundle.entry?.push({ resource: observation })
        }

    }
    bundle.total = bundle.entry?.length || 0;
    bundle.entry?.forEach(entry => entry.search = { mode: 'match' })
    return bundle;
  }
}
