import {CanActivateFn, Router} from "@angular/router";
import {inject} from "@angular/core";
import {SmartOnFhirService} from "../smart-on-fhir.service";

export const redirectUnauthorizedToLogin: CanActivateFn = async function (route, state) {
  const router = inject(Router);
  const sof = inject(SmartOnFhirService);
  try {
    const client = await sof.getClient();
    if (client.getPatientId()) {
      return true;
    }
  } catch (err) {}
  router.navigate(['/login'])
  return false;
}
