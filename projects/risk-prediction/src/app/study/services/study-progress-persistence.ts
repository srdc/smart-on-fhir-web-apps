import {InjectionToken, Injectable} from '@angular/core';
import {StudyCaseProgress, StudyParticipantProgress} from '../models/study-case-progress';

export interface StudyProgressPersistence {
  load(caseId: string): StudyCaseProgress | null;
  save(progress: StudyCaseProgress): void;
  remove(caseId: string): void;
  getActiveCaseId(): string | null;
  setActiveCaseId(caseId: string | null): void;
  loadParticipant(): StudyParticipantProgress | null;
  saveParticipant(progress: StudyParticipantProgress): void;
}

export const STUDY_PROGRESS_PERSISTENCE = new InjectionToken<StudyProgressPersistence>(
  'STUDY_PROGRESS_PERSISTENCE'
);

@Injectable()
export class LocalStorageStudyProgressPersistence implements StudyProgressPersistence {
  private readonly caseKeyPrefix = 'study_case_progress:';
  private readonly activeCaseKey = 'study_active_case_id';
  private readonly participantKey = 'study_participant_progress';

  load(caseId: string): StudyCaseProgress | null {
    const value = localStorage.getItem(this.caseKey(caseId));
    return value ? JSON.parse(value) as StudyCaseProgress : null;
  }

  save(progress: StudyCaseProgress): void {
    localStorage.setItem(this.caseKey(progress.caseId), JSON.stringify(progress));
  }

  remove(caseId: string): void {
    localStorage.removeItem(this.caseKey(caseId));
  }

  getActiveCaseId(): string | null {
    return localStorage.getItem(this.activeCaseKey);
  }

  setActiveCaseId(caseId: string | null): void {
    if (caseId) {
      localStorage.setItem(this.activeCaseKey, caseId);
    } else {
      localStorage.removeItem(this.activeCaseKey);
    }
  }

  loadParticipant(): StudyParticipantProgress | null {
    const value = localStorage.getItem(this.participantKey);
    return value ? JSON.parse(value) as StudyParticipantProgress : null;
  }

  saveParticipant(progress: StudyParticipantProgress): void {
    localStorage.setItem(this.participantKey, JSON.stringify(progress));
  }

  private caseKey(caseId: string): string {
    return `${this.caseKeyPrefix}${caseId}`;
  }
}
