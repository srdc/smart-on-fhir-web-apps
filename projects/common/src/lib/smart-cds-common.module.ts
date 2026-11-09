import {ModuleWithProviders, NgModule, Provider} from '@angular/core';
import { CdsHooksModule, CdsHooksServiceConfig } from 'cds-hooks'
import { SmartOnFhirModule, SmartOnFhirConfig } from 'ng-smart-on-fhir';
import {
  CdsPanelsComponent, ImportHealthCardComponent, LinkVaultFormComponent, PatientInfoComponent, PatientSelectComponent,
  ShareHealthCardDialogComponent
} from "./components";
import {FormsModule} from "@angular/forms";
import {CommonModule, JsonPipe, KeyValuePipe, NgForOf, NgIf} from "@angular/common";
import {
  CdsDataService,
  CarePlanHealthCardProfileProvider,
  ImportedHealthCardProfileProvider,
  ReceivedHealthCardProfileProvider,
  CdsHealthCardProfileProvider,
  HEALTH_CARD_CONFIG,
  HEALTH_CARD_PROFILE_PROVIDERS,
  HealthCardConfig,
  IpsHealthCardProfileProvider,
  SharedLinkVaultService,
  StatefulCdsService
} from "./services";
import {RouterModule} from "@angular/router";
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
    PatientInfoComponent,
    ImportHealthCardComponent,
    PatientSelectComponent,
    ShareHealthCardDialogComponent,
    LinkVaultFormComponent
  ],
  imports: [
    CdsHooksModule,
    SmartOnFhirModule,
    FormsModule,
    KeyValuePipe,
    NgForOf,
    JsonPipe,
    NgIf,
    CommonModule,
    RouterModule
  ],
  exports: [
    CdsPanelsComponent,
    PatientInfoComponent,
    ImportHealthCardComponent,
    PatientSelectComponent,
    ShareHealthCardDialogComponent,
    LinkVaultFormComponent
  ],
  providers: []
})
export class SmartCdsCommonModule {
  public static forRoot(env: { smart: SmartOnFhirConfig & HealthCardConfig, cds: CdsHooksServiceConfig<fhir4.Resource> }): ModuleWithProviders<SmartCdsCommonModule> {
    if (!env.cds.sort) {
      env.cds.sort = sorting;
    }
    return {
      ngModule: SmartCdsCommonModule,
      providers: <Provider[]>[
        CdsHooksModule.forRoot(env.cds).providers,
        // the encrypted link vaults (Shared Links) are kept across logins
        SmartOnFhirModule.forRoot({...env.smart, keepOnLogout: [...(env.smart.keepOnLogout || []), SharedLinkVaultService.STORAGE_PREFIX]}).providers,
        StatefulCdsService,
        CdsDataService,
        {provide: HEALTH_CARD_CONFIG, useValue: <HealthCardConfig>{
          shlServerBaseUrl: env.smart.shlServerBaseUrl,
          shlServerBaseUrls: env.smart.shlServerBaseUrls,
          shlOwnerAuth: env.smart.shlOwnerAuth,
          healthCardValueSetBaseUrl: env.smart.healthCardValueSetBaseUrl,
          linkVaultAutoLockMinutes: env.smart.linkVaultAutoLockMinutes,
          healthCardProfiles: env.smart.healthCardProfiles
        }},
        // health card profiles offered for the patient (IPS first, then one per CDS service); apps may register more providers
        env.smart.healthCardProfiles?.ips !== false
          ? {provide: HEALTH_CARD_PROFILE_PROVIDERS, useClass: IpsHealthCardProfileProvider, multi: true} : [],
        env.smart.healthCardProfiles?.cds !== false
          ? {provide: HEALTH_CARD_PROFILE_PROVIDERS, useClass: CdsHealthCardProfileProvider, multi: true} : [],
        env.smart.healthCardProfiles?.carePlan === true
          ? {provide: HEALTH_CARD_PROFILE_PROVIDERS, useExisting: CarePlanHealthCardProfileProvider, multi: true} : [],
        env.smart.healthCardProfiles?.imported !== false
          ? {provide: HEALTH_CARD_PROFILE_PROVIDERS, useExisting: ImportedHealthCardProfileProvider, multi: true} : [],
        env.smart.healthCardProfiles?.received !== false
          ? {provide: HEALTH_CARD_PROFILE_PROVIDERS, useExisting: ReceivedHealthCardProfileProvider, multi: true} : []
      ]
    }
  }
}
