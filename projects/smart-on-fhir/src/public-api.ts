/*
 * Public API Surface of smart-on-fhir
 */

import {CallbackComponent} from "./lib/callback/callback.component";
import {LaunchComponent} from "./lib/launch/launch.component";
import {Routes} from "@angular/router";
import {LoginComponent} from "./lib/login/login.component";
import {redirectUnauthorizedToLogin} from './lib/guard/redirect-to-login-guard';

export * from './lib/smart-on-fhir.service';
export * from './lib/smart-on-fhir.module';

export const withSmartHandlerRoutes: (routes: Routes, redirectTo: string, method: 'launch'|'client'|'both', redirectToLoginIfUnauthorized: boolean) => Routes =
  (routes: Routes, redirectTo: string, method: 'launch'|'client'|'both', redirectToLoginIfUnauthorized: boolean) => {
  const smartRoutes: Routes = [{
    path: 'callback',
    component: CallbackComponent,
    data: { redirectTo }
  }];
  if (method !== 'client') {
    smartRoutes.push({
        path: 'launch',
        component: LaunchComponent
    })
  }
  if (method !== 'launch') {
    smartRoutes.push({
      path: 'login',
      component: LoginComponent
    })
  }
  return [
    ...routes.map(route => {
      if (redirectToLoginIfUnauthorized) {
        route.canActivate = (route.canActivate || []).concat([redirectUnauthorizedToLogin]);
      }
      return route
    }),
    ...smartRoutes
  ]
}
