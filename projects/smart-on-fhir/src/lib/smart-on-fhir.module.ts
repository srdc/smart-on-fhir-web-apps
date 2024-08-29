import {ModuleWithProviders, NgModule} from '@angular/core';
import {SmartOnFhirService} from "./smart-on-fhir.service";
import {LoginComponent} from "./login/login.component";
import {LaunchComponent} from "./launch/launch.component";
import {CallbackComponent} from "./callback/callback.component";
import {NgStyle} from "@angular/common";

export interface LoginClientConfig {
  label: string;
  image?: string;
  icon?: string;
  background?: string;
  color?: string;
  clientId: string;
  iss: string;
  redirectUri: string;
  scope: string;
}

export interface LaunchClientConfig {
  label: string;
  url: string;
  image?: string;
  icon?: string;
  background?: string;
  color?: string;
}

export interface SmartOnFhirConfig {
  clientIds?: {[iss: string]: string};
  clientId?: string;
  redirectUrl?: string;
  loginClients?: LoginClientConfig[];
  launchClients?: LaunchClientConfig[];
}

@NgModule({
  imports: [
    NgStyle
  ],
  exports: [],
  declarations: [LoginComponent, LaunchComponent, CallbackComponent],
  providers: [SmartOnFhirService],
})
export class SmartOnFhirModule {
  static forRoot(config: SmartOnFhirConfig): ModuleWithProviders<SmartOnFhirModule> {
    return {
      ngModule: SmartOnFhirModule,
      providers: [SmartOnFhirService, {provide: 'sofConfig', useValue: config}]
    }
  }
}
