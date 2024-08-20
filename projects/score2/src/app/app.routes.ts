import { Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "smart-on-fhir";

export const routes: Routes = withSmartHandlerRoutes([], '/', 'both', true);
