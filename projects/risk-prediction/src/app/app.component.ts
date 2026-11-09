import {Component, Injector} from '@angular/core';
import {NavigationEnd, Router} from '@angular/router';
import {filter} from 'rxjs';
import { CdsBaseComponent, CDSInitializer, CdsDataService, StatefulCdsService } from "common";
import { environment } from "../environments/environment";
import { SmartOnFhirService } from "ng-smart-on-fhir";
import {MenuService} from "./menu.service";


@Component({
  selector: 'rp-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent extends CdsBaseComponent implements CDSInitializer {
  override serviceName = environment.cds.serviceName;
  sidebarRows: any[] = [];
  loadingError?: string;

  user = this.sof.getUser()
  /** User login without a patient context (e.g. a clinician at another EHR): patients are selected by importing their cards */
  canSelectPatient = false;
  /** Logged in, but no patient selected yet */
  noPatient = false;

  constructor(override cdsDataService: CdsDataService, override sof: SmartOnFhirService, override injector: Injector,
              override cdsService: StatefulCdsService, public menuService: MenuService, private router: Router) {
    super(cdsDataService, sof, injector, cdsService);
  }

  override async ngOnInit() {
    // without a patient, there is nothing to show but the import page (also after the login callback redirects)
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.redirectToImport(event.urlAfterRedirects));
    const [patient, user] = await Promise.all([this.sof.getPatient(), this.sof.getUser()]);
    this.canSelectPatient = this.sof.canSelectPatient();
    if (!patient && user && this.canSelectPatient) {
      this.noPatient = true;
      this.redirectToImport(this.router.url);
      return;
    }
    super.ngOnInit().catch((err: any) => {
      this.loadingError = err.message || err.toString()
    });
    this.prepareSidebarData();
  }

  /** Logged in without a patient (user login at another EHR): import the patient's Smart Health Card/Link first */
  private redirectToImport(url: string) {
    if (this.noPatient && !/^\/(import|login|callback|launch|shc|shl)\b/.test(url)) {
      this.router.navigate(['/import']);
    }
  }

  private calculateAge(birthDate?: string): number | null {
    if (!birthDate) return 1;

    const dob = new Date(birthDate);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();

    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  private async prepareSidebarData() {
    const patient = await this.sof.getPatient();
    if (!patient) return;
    this.sidebarRows = [
      {
        label: 'Name',
        value: patient.name?.[0]?.given?.join(' ') + ' ' + patient.name?.[0]?.family || 'N/A'
      },
      {
        label: 'Gender',
        value: patient.gender || 'N/A'
      },
      {
        label: 'Birth Date',
        value: patient.birthDate || 'N/A'
      },
      {
        label: 'Age',
        value: this.calculateAge(patient.birthDate)?.toString() || 'N/A'
      },
      {
        label: 'Patient ID',
        value: patient.id || 'N/A'
      }
    ];
  }

}
