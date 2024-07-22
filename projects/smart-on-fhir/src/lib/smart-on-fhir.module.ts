import {ModuleWithProviders, NgModule} from '@angular/core';
import {SmartOnFhirService} from "./smart-on-fhir.service";
import {LoginComponent} from "./login/login.component";
import {LaunchComponent} from "./launch/launch.component";
import {CallbackComponent} from "./callback/callback.component";

export interface SmartOnFhirConfig {
  clientId?: string;
  iss?: string;
  redirectUri?: string;
  scope?: string;
}

@NgModule({
  imports: [],
  exports: [],
  declarations: [LoginComponent, LaunchComponent, CallbackComponent],
  providers: [SmartOnFhirService],
})
export class SmartOnFhirModule {
  static forRoot(config: SmartOnFhirConfig): ModuleWithProviders<SmartOnFhirModule> {
    return {
      ngModule: SmartOnFhirModule,
      providers: [SmartOnFhirService, {provide: 'config', useValue: config}],
    }
  }
}
