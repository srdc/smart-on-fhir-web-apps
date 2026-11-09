import {Component, Input, OnInit, Optional} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {patientName, ShlService, SmartOnFhirService} from 'ng-smart-on-fhir';

/**
 * Patient selection for user logins without a patient context (e.g. a clinician logging in to an EHR without a
 * patient launch): import the patient's SMART Health Card/Link into the record (scan, paste or file), or choose a patient
 * already in the record. The app is then reloaded with the patient selected (SmartOnFhirService.selectPatient).
 *
 * Route it (e.g. path 'select-patient', data: {openPatientUrl: 'summary'}) and send users without a patient there.
 * For patient logins (no patient selection) only the import into the patient's own record is offered.
 */
@Component({
  selector: 'app-patient-select',
  templateUrl: './patient-select.component.html'
})
export class PatientSelectComponent implements OnInit {

  /** Page opened with the selected patient, relative to the app's base URL; default: route data 'openPatientUrl', else home */
  @Input() openPatientUrl?: string;
  @Input() title?: string;

  canSelectPatient = false;
  current?: fhir4.Patient;
  tab: 'import' | 'search' = 'import';

  query = {name: '', birthDate: ''};
  patients?: fhir4.Patient[];
  searching = false;
  searchError?: string;

  readonly patientName = patientName;

  constructor(private sof: SmartOnFhirService, private shl: ShlService, @Optional() private route?: ActivatedRoute) {
  }

  async ngOnInit() {
    this.canSelectPatient = this.sof.canSelectPatient();
    this.current = await this.sof.getPatient().catch(() => undefined);
    if (this.canSelectPatient) {
      this.search();
    }
  }

  get pageUrl(): string {
    return this.openPatientUrl ?? this.route?.snapshot.data['openPatientUrl'] ?? '';
  }

  /** Patients of the record, by name and/or birth date (the first ones without criteria) */
  async search(): Promise<void> {
    this.searching = true;
    this.searchError = undefined;
    try {
      const params: { [key: string]: string | number } = {_count: 50};
      if (this.query.name.trim()) {
        params['name'] = encodeURIComponent(this.query.name.trim());
      }
      if (this.query.birthDate) {
        params['birthdate'] = this.query.birthDate;
      }
      const bundle = await this.sof.search<fhir4.Patient>('Patient', params);
      this.patients = (bundle.entry || []).map(entry => entry.resource)
        .filter((patient): patient is fhir4.Patient => !!patient?.id)
        .sort((a, b) => patientName(a).localeCompare(patientName(b)));
    } catch (err) {
      console.error('Patients could not be searched', err);
      this.patients = [];
      this.searchError = 'The patients could not be loaded from the record.';
    } finally {
      this.searching = false;
    }
  }

  select(patient: fhir4.Patient): void {
    this.sof.selectPatient(patient);
    window.location.assign(new URL(this.pageUrl, document.baseURI).href);
  }

  /** Where the patient record came from (meta.source, e.g. the issuer of an imported card), if another server */
  origin(patient: fhir4.Patient): string | undefined {
    const source = patient.meta?.source;
    return source && /^https?:\/\//.test(source) ? this.shl.trustedIssuer(source)?.name || source : undefined;
  }

  logout(): void {
    this.sof.logout();
  }
}
