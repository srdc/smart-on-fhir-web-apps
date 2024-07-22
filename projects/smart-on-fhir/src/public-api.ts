/*
 * Public API Surface of smart-on-fhir
 */

import {CallbackComponent} from "./lib/callback/callback.component";
import {LaunchComponent} from "./lib/launch/launch.component";
import {Routes} from "@angular/router";
import {LoginComponent} from "./lib/login/login.component";

export * from './lib/smart-on-fhir.service';

export const smartHandlerRoutes: (redirectTo: string, method: 'launch'|'client'|'both') => Routes =
  (redirectTo: string, method: 'launch'|'client'|'both') => {
  const routes: Routes = [{
    path: 'callback',
    component: CallbackComponent,
    data: { redirectTo }
  }];
  if (method !== 'client') {
    routes.push({
        path: 'launch',
        component: LaunchComponent
    })
  }
  if (method !== 'launch') {
    routes.push({
      path: 'login',
      component: LoginComponent
    })
  }
  return routes
}
