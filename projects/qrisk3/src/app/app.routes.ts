import { Routes } from '@angular/router';
import {smartHandlerRoutes} from "../../../smart-on-fhir/src/public-api";

export const routes: Routes = [
  ...smartHandlerRoutes('/', 'both')
];
