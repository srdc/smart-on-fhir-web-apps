import { NgModule } from '@angular/core';
import { CdsHooksModule } from 'cds-hooks'
import {CdsPanelsComponent} from "./components";
import {FormsModule} from "@angular/forms";
import {JsonPipe, KeyValuePipe, NgForOf, NgIf} from "@angular/common";
import {StatefulCdsService} from "./services";

@NgModule({
  declarations: [
    CdsPanelsComponent
  ],
  imports: [
    CdsHooksModule.forRoot({
      baseUrl: 'http://localhost:8084',
      sort: {
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
    }),
    FormsModule,
    KeyValuePipe,
    NgForOf,
    JsonPipe,
    NgIf
  ],
  exports: [
    CdsPanelsComponent
  ],
  providers: [
    StatefulCdsService
  ]
})
export class SmartCdsCommonModule { }
