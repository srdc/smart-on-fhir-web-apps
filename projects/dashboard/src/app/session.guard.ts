import {inject} from '@angular/core';
import {CanActivateFn} from '@angular/router';
import {SmartAuthService} from 'ng-smart-on-fhir';

const SAVED_SESSION_KEY = 'SMART_APPS_SESSION';
let restoring: Promise<unknown> | undefined;

/**
 * The dashboard is public: its pages open without a session. If the user is logged in (in the dashboard, or in another
 * STAGE app on this origin: the apps share the session through localStorage), the session is restored once, so that the
 * dashboard shows the patient/user and the apps launched from it continue with the same session.
 */
export const restoreSessionIfAny: CanActivateFn = async () => {
  const auth = inject(SmartAuthService);
  if (!auth.isLoggedIn() && hasSavedSession()) {
    restoring ??= auth.start().catch(error => console.warn('The saved session could not be restored', error));
    await restoring;
  }
  return true;
};

function hasSavedSession(): boolean {
  try {
    return !!(sessionStorage.getItem(SAVED_SESSION_KEY) || localStorage.getItem(SAVED_SESSION_KEY));
  } catch {
    return false;
  }
}
