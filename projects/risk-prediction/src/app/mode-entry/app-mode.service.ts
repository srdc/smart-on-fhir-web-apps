import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

export type AppMode = 'risk_prediction' | 'study' | null;

@Injectable({providedIn: 'root'})
export class AppModeService {
  private readonly storageKey = 'app_mode';
  private readonly modeSubject = new BehaviorSubject<AppMode>(this.read());
  readonly modeChanges = this.modeSubject.asObservable();

  get mode(): AppMode {
    return this.modeSubject.value;
  }

  select(mode: Exclude<AppMode, null>): void {
    sessionStorage.setItem(this.storageKey, mode);
    this.modeSubject.next(mode);
  }

  clear(): void {
    sessionStorage.removeItem(this.storageKey);
    this.modeSubject.next(null);
  }

  private read(): AppMode {
    const stored = sessionStorage.getItem(this.storageKey);
    return stored === 'risk_prediction' || stored === 'study' ? stored : null;
  }
}
