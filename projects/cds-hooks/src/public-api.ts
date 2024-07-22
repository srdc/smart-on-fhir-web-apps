/*
 * Public API Surface of cds-hooks
 */

import {ModuleWithProviders} from "@angular/core";
import {CdsHooksService, CdsHooksServiceConfig} from "./lib/cds-hooks.service";

import {NgModule} from '@angular/core';
import {HttpClientModule} from "@angular/common/http";

@NgModule({
  imports: [HttpClientModule],
  exports: [],
  declarations: [],
  providers: [],
})
export class CdsHooksModule {
  static forRoot<T extends {resourceType: string, id?: string}>(config: CdsHooksServiceConfig<T>): ModuleWithProviders<CdsHooksModule> {
    return {
      ngModule: CdsHooksModule,
      providers: [ CdsHooksService<T>, { provide: 'config', useValue: config } ]
    }
  }
}

export { CdsHooksService } from "./lib/cds-hooks.service"
