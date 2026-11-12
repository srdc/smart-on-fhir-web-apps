import {Injectable} from '@angular/core';

@Injectable({providedIn: 'root'})
export class StudySmartContextService {
  private readonly destinationKey = 'study_smart_return_destination';

  preserve(destination: string): void {
    sessionStorage.setItem(this.destinationKey, destination.startsWith('/study') ? destination : '/study');
  }

  consume(): string | null {
    const destination = sessionStorage.getItem(this.destinationKey);
    sessionStorage.removeItem(this.destinationKey);
    return destination?.startsWith('/study') ? destination : null;
  }

  clear(): void {
    sessionStorage.removeItem(this.destinationKey);
  }
}
