import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

@Injectable({providedIn: 'root'})
export class PatientSummaryShellService {
  private readonly studyPatientSubject = new BehaviorSubject<fhir4.Patient | null>(null);
  readonly studyPatient$ = this.studyPatientSubject.asObservable();
  studyAgeOverride: number | null = null;

  setStudyPatient(patient: fhir4.Patient, age?: number): void {
    this.studyAgeOverride = Number.isFinite(age) ? Math.floor(age!) : null;
    this.studyPatientSubject.next(patient);
  }

  clearStudyPatient(): void {
    this.studyAgeOverride = null;
    this.studyPatientSubject.next(null);
  }
}
