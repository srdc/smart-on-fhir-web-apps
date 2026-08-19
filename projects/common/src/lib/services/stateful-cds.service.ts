import {Injectable, Injector, Signal} from '@angular/core';
import {Subject} from "rxjs";
import {CdsHooksService} from 'cds-hooks'
import {SmartOnFhirService} from 'ng-smart-on-fhir'

export interface CreateStateOptions {
  serviceId: string;
  patient?: fhir4.Patient;
  language?: string;
  resources?: fhir4.Resource[];
  onPrefetchStateChange?: PrefetchStateChangeOptions;
}

export interface PrefetchStateChangeOptions {
  callService?: boolean;
  transformState?: (state: any) => {prefetch: any, context: any};
  handleServiceResponse?: (response: any) => any;
  handleServiceError?: (error: Error) => any;
  handleState?: (state: any) => any;
  injector: Injector;
  takeUntil?: Subject<any>;
}

@Injectable()
export class StatefulCdsService {

  constructor(private cds: CdsHooksService<fhir4.Resource>, private sof: SmartOnFhirService) { }

  async createState(options: CreateStateOptions) {
    const cdsDefinition = await this.cds.getServiceDefinition(options.serviceId)
    const conceptDefinitionResp = await this.cds.callService({
      serviceId: 'definition',
      context: { serviceId: options.serviceId },
      prefetch: {}
    })
    const conceptDefinition: { [conceptId: string]: any } = JSON.parse(conceptDefinitionResp.cards[0].detail
      .replaceAll('&quot;', '"')
      .replaceAll('&gt;', '>')
      .replaceAll('&lt;', '<')
    )
    const conceptDefinitions: any[] = [];
    await Promise.all(Object.entries(conceptDefinition).map(async ([conceptId, definition]) => {
      if (!this.cds.hasConcept(conceptId)) {
        const query = cdsDefinition.prefetch[conceptId]
          && cdsDefinition.prefetch[conceptId].replaceAll("{{context.patientId}}", options.patient?.id);
        const bundle = query ?
          await this.sof.query<fhir4.Resource>(query).catch(err => ({ entry: [] })) : { entry: [] }
        const importedResources = await this.queryImportedResources(definition.resourceType, query)
        const resources: fhir4.Resource[] = importedResources.concat(
          bundle.entry?.filter(entry => entry.resource?.resourceType === definition.resourceType)
            .map(entry => <fhir4.Resource>entry.resource) || []
        );
        const initial = this.getInitialValue(definition, resources)
        definition.value = this.cds.addConcept(conceptId, initial, resources)
      } else {
        definition.value = this.cds.getValue(conceptId)
      }
      definition.id = conceptId;
      conceptDefinitions.push(definition)
    }))
    this.onPrefetchStateChange(options)
    return conceptDefinitions
  }

  async onPrefetchStateChange(options: CreateStateOptions) {
    if (options.onPrefetchStateChange) {
      const cdsDefinition = await this.cds.getServiceDefinition(options.serviceId)
      this.cds.onChange(Object.keys(cdsDefinition.prefetch), (state: any) => {
          if (options.onPrefetchStateChange?.handleState) {
            options.onPrefetchStateChange?.handleState(state)
          }
          if (options.onPrefetchStateChange?.callService) {
            const params: { context?: any, prefetch?: any } = options.onPrefetchStateChange.transformState ? options.onPrefetchStateChange.transformState(state) : {}
            this.callService(options, params).then(options.onPrefetchStateChange.handleServiceResponse, options.onPrefetchStateChange.handleServiceError)
          }
        },
        options.onPrefetchStateChange.injector, options.onPrefetchStateChange.takeUntil)
    }
  }

  private getInitialValue(definition: any, resources: fhir4.Resource[]) {
    const initialValue: any = {}
    const latest = this.cds.findLatest(resources)
    switch (definition.type) {
      case 'Quantity':
        const obs = (<fhir4.Observation>latest)
        if (obs?.code?.coding?.some(coding => coding.code === definition['code'].code) && !isNaN(<any>obs.valueQuantity?.value)) {
          initialValue.value = obs.valueQuantity?.value;
          initialValue.unit =  obs.valueQuantity?.unit || definition.unit;
        } else {
          const comp = obs?.component?.find(component => component.code.coding?.some(coding => coding.code === definition['code'].code))
          initialValue.value = comp?.valueQuantity?.value;
          initialValue.unit =  comp?.valueQuantity?.unit || definition.unit;
        }
        break;
      case 'CodeableConcept':
        Object.assign(initialValue, (<fhir4.Observation>latest)?.valueCodeableConcept?.coding?.at(0) || {})
        break;
      case 'boolean':
      default:
        initialValue.value = !!resources.length
        initialValue.selected = definition.required ? definition.select[0] : undefined
    }
    return initialValue
  }

  resetState(conceptDefinitions: { id: string; value: Signal<any>; [p: string]: any }[]) {
    conceptDefinitions.forEach(definition => {
      this.cds.setValue(definition.id, this.getInitialValue(definition, this.cds.getResources(definition.id)))
    })
  }

  getState(conceptDefinitions: { id: string; value: Signal<any>; [p: string]: any }[]) {
    return this.cds.getCurrentState(conceptDefinitions.map(definition => definition.id))
  }

  async callService(options: CreateStateOptions, params: { prefetch?: any, context?: any }): Promise<any> {
    const client = await this.sof.getClient();
    return await this.cds.callService({
      serviceId: options.serviceId,
      language: options.language,
      fhirServer: client?.state?.serverUrl,
      fhirAuthorization: client?.state.tokenResponse,
      prefetch: params.prefetch || {},
      context: params.context || {}
    })
  }

  async queryImportedResources(resourceType: string, query: string): Promise<fhir4.Resource[]> {
    if (this.sof.importedResources && this.sof.importedResources[resourceType]) {
      const response = await this.cds.callService({
        serviceId: 'in-memory-search',
        context: { query },
        prefetch: {
          bundle: <fhir4.Bundle>{
            resourceType: 'Bundle',
            id: 'input',
            entry: this.sof.importedResources[resourceType].map(resource => ({ resource }))
          }
        }
      })
      try {
        const matchedBundle: fhir4.Bundle = JSON.parse(response.cards[0].detail
          .replaceAll('&quot;', '"')
          .replaceAll('&gt;', '>')
          .replaceAll('&lt;', '<'))
        return matchedBundle.entry?.map(entry => <fhir4.Resource>entry.resource) || []
      } catch (err) {
        return []
      }
    }
    return [];
  }
}
