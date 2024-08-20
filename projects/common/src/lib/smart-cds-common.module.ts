import { NgModule } from '@angular/core';
import { CdsHooksModule } from 'cds-hooks'
import { SmartOnFhirModule } from 'smart-on-fhir';
import {CdsPanelsComponent, PatientInfoComponent} from "./components";
import {FormsModule} from "@angular/forms";
import {JsonPipe, KeyValuePipe, NgForOf, NgIf} from "@angular/common";
import {CdsDataService, StatefulCdsService} from "./services";

@NgModule({
  declarations: [
    CdsPanelsComponent,
    PatientInfoComponent
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
    SmartOnFhirModule.forRoot({
      loginClients: [
        {
          label: 'EPIC',
          image: 'https://fhir.epic.com/Content/images/EpicOnFhir.png',
          iss: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/',
          redirectUri: 'http://localhost:4200/callback',
          clientId: '43a60ffa-242a-4bbe-bb17-97666be7189e',
          scope: 'launch launch/patient patient/*.*'
        }
      ],
      launchClients: [
        {
          label: 'Smart Health IT',
          image: 'https://apps.smarthealthit.org/logo.svg',
          url: 'https://launch.smarthealthit.org/launcher?launch_uri=http%3A%2F%2Flocalhost%3A4200%2Flaunch&patient=f2316789-30c4-4c06-9193-0ca5475bbb1b%2Cd00b080d-706e-4cd8-ae87-6531e798b1fd%2C0488ce70-f68d-45fb-b6a5-29684d0e4f35%2C010fd829-1ef3-49c9-98c4-df7561709bc7%2C5ee05359-57bf-4cee-8e89-91382c07e162%2Cd8a00854-f768-4195-a025-9af34b2e0e9f%2C4e8ed886-fd5f-40bb-8feb-f339b04d853a%2C95c0165c-f900-4b50-90db-8176b4fd935d%2Cd39173c2-7dc5-4a08-aba0-3f14f6b70d94%2C2b729cb8-0713-4dec-9dfb-ae0aecb28fb4%2Cab47f921-b3c4-4bbe-8744-9bf303f64db9%2C6daf3d7c-1620-4d79-9396-990469306470%2C57a5a683-f51e-4976-ad1d-c2c4d3385cec%2Cbf3cb50a-d753-4ddc-ad83-839250edcba9%2C68eec23c-3211-4eba-a28b-c26a2f7f49c4%2Cba18818d-faef-44cd-9744-b12d8973d402%2C87c34098-98c4-4a22-904d-6a84082e8bc7%2Cf1d97e9a-14be-4304-acc3-5411ed8c4e7f%2C05feb4fd-d431-4977-841c-50bd0afc0183%2C983561b3-02dd-4227-88a7-835827bd9566%2C0b779465-6db2-4931-bc13-5f6ff8e8c4d4&fhir_ver=4'
        },
        {
          label: 'NIH - Smart Launch',
          background: '#326295',
          color: 'white',
          url: 'https://lforms-smart-fhir.nlm.nih.gov/'
        }
      ]
    }),
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
  providers: [
    StatefulCdsService,
    CdsDataService
  ]
})
export class SmartCdsCommonModule { }
