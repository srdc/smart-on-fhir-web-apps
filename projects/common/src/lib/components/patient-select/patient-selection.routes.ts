import {inject} from '@angular/core';
import {CanActivateFn, Router, Routes} from '@angular/router';
import {SmartAuthService, SmartOnFhirService} from 'ng-smart-on-fhir';
import {PatientSelectComponent} from './patient-select.component';

/** Path of the patient selection page added by withPatientSelection */
export const PATIENT_SELECTION_PATH = 'select-patient';

/**
 * Users logged in without a patient context (e.g. a clinician, login client without launch/patient) are sent to the
 * patient selection page first: the app's pages need a patient. Other users (not logged in, patient context, launch)
 * pass; the login itself is checked by the SMART routes (withSmartHandlerRoutes).
 */
export const requirePatientSelection: CanActivateFn = async () => {
  const auth = inject(SmartAuthService);
  const sof = inject(SmartOnFhirService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return true;
  }
  const [patient] = await Promise.all([sof.getPatient(), sof.getUser()]).catch(() => [undefined]);
  return patient || !sof.canSelectPatient() ? true : router.parseUrl('/' + PATIENT_SELECTION_PATH);
};

/**
 * The app's routes with patient selection for user logins without a patient context: the select-patient page (import
 * the patient's Smart Health Card/Link or choose a patient in the record), and the routes guarded so that such users go
 * there first. Wrap it with withSmartHandlerRoutes:
 *
 *   withSmartHandlerRoutes(withPatientSelection([...routes], 'results'), '/', 'both', true, true)
 *
 * @param routes - the app's pages (redirects are left as they are)
 * @param openPatientUrl - page opened with the selected patient, relative to the app's base URL (default: home)
 */
export function withPatientSelection(routes: Routes, openPatientUrl = ''): Routes {
  return [
    ...routes.map(route => route.redirectTo === undefined
      ? {...route, canActivate: [...(route.canActivate || []), requirePatientSelection]}
      : route),
    {
      path: PATIENT_SELECTION_PATH,
      component: PatientSelectComponent,
      data: {openPatientUrl}
    }
  ];
}
