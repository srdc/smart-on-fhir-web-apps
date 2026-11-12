import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, map, tap} from 'rxjs/operators';
import {environment} from '../../../environments/environment';

interface StudyLoginResponse {
  accessToken: string;
  tokenType: 'bearer';
  participantId: string;
}

@Injectable({providedIn: 'root'})
export class StudyAuthService {
  private readonly tokenKey = 'study_access_token';
  private readonly participantKey = 'study_participant_id';
  private readonly loginUrl = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study/auth/login`;
  private readonly authState = new BehaviorSubject<StudyLoginResponse | null>(this.readStoredSession());
  readonly isAuthenticated$ = this.authState.pipe(
    map(state => state !== null),
    distinctUntilChanged()
  );

  constructor(private http: HttpClient) {}

  login(participantId: string, pin: string): Observable<StudyLoginResponse> {
    return this.http.post<StudyLoginResponse>(this.loginUrl, {
      participantId: participantId.trim(),
      pin
    }).pipe(tap(response => {
      sessionStorage.setItem(this.tokenKey, response.accessToken);
      sessionStorage.setItem(this.participantKey, response.participantId);
      this.authState.next(response);
    }));
  }

  logout(): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.participantKey);
    this.authState.next(null);
  }

  get accessToken(): string | null {
    const token = this.authState.value?.accessToken ?? null;
    if (!token || this.isExpired(token)) {
      this.logout();
      return null;
    }
    return token;
  }

  get participantId(): string | null {
    return this.accessToken ? this.authState.value?.participantId ?? null : null;
  }

  get isAuthenticated(): boolean {
    return this.authState.value !== null && !!this.accessToken;
  }

  private readStoredSession(): StudyLoginResponse | null {
    const accessToken = sessionStorage.getItem(this.tokenKey);
    const participantId = sessionStorage.getItem(this.participantKey);
    if (!accessToken || !participantId || this.isExpired(accessToken)) {
      sessionStorage.removeItem(this.tokenKey);
      sessionStorage.removeItem(this.participantKey);
      return null;
    }
    return {accessToken, participantId, tokenType: 'bearer'};
  }

  private isExpired(token: string): boolean {
    try {
      const normalized = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }
}
