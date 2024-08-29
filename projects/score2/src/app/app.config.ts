import {ApplicationConfig, importProvidersFrom} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import {SmartCdsCommonModule} from "../../../common/src/lib/smart-cds-common.module";
import {environment} from "../environments/environment";

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), importProvidersFrom(SmartCdsCommonModule.forRoot(environment))]
};
