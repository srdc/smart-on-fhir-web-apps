import {ModuleWithProviders, NgModule, Provider} from '@angular/core';
import { CdsHooksModule, CdsHooksServiceConfig } from 'cds-hooks'
import { SmartOnFhirModule, SmartOnFhirConfig } from 'smart-on-fhir';
import {CdsPanelsComponent, PatientInfoComponent} from "./components";
import {FormsModule} from "@angular/forms";
import {JsonPipe, KeyValuePipe, NgForOf, NgIf} from "@angular/common";
import {CdsDataService, StatefulCdsService} from "./services";

/**
 * Will be replaced with FHIR path sorting
 * */
const sorting = {
  custom: (resource1: any, resource2: any) => {
    if (resource1.resourceType !== resource2.resourceType) {
      return 0
    }
    let date1: any, date2: any
    switch (resource1.resourceType) {
      case 'Condition':
        date1 = (<fhir4.Condition>resource1).onsetDateTime
        date2 = (<fhir4.Condition>resource2).onsetDateTime
        break;
      case 'Observation':
        date1 = (<fhir4.Observation>resource1).effectiveDateTime
        date2 = (<fhir4.Observation>resource2).effectiveDateTime
    }
    return !date1 || (date2 && (date1 > date2)) ? -1 : 1;
  }
}


@NgModule({
  declarations: [
    CdsPanelsComponent,
    PatientInfoComponent
  ],
  imports: [
    CdsHooksModule,
    SmartOnFhirModule,
    FormsModule,
    KeyValuePipe,
    NgForOf,
    JsonPipe,
    NgIf
  ],
  exports: [
    CdsPanelsComponent,
    PatientInfoComponent
  ],
  providers: []
})
export class SmartCdsCommonModule {
  public static forRoot(env: { smart: SmartOnFhirConfig, cds: CdsHooksServiceConfig<fhir4.Resource> }): ModuleWithProviders<SmartCdsCommonModule> {
    if (!env.cds.sort) {
      env.cds.sort = sorting;
    }
    return {
      ngModule: SmartCdsCommonModule,
      providers: <Provider[]>[
        CdsHooksModule.forRoot(env.cds).providers,
        SmartOnFhirModule.forRoot(env.smart).providers,
        StatefulCdsService,
        CdsDataService
      ]
    }
  }
}
