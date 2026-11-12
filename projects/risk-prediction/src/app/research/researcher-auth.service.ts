import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, map, tap} from 'rxjs/operators';
import {environment} from '../../environments/environment';

export interface ResearcherLoginResponse {
  accessToken: string;
  tokenType: 'bearer';
  researcherId: string;
}

@Injectable({providedIn: 'root'})
export class ResearcherAuthService {
  private readonly tokenKey = 'research_access_token';
  private readonly idKey = 'researcher_id';
  private readonly loginUrl = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study/research/auth/login`;
  private readonly authState = new BehaviorSubject<ResearcherLoginResponse | null>(this.readStoredSession());
  readonly isAuthenticated$ = this.authState.pipe(map(value => value !== null), distinctUntilChanged());

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<ResearcherLoginResponse> {
    return this.http.post<ResearcherLoginResponse>(this.loginUrl, {username: username.trim(), password})
      .pipe(tap(response => {
        sessionStorage.setItem(this.tokenKey, response.accessToken);
        sessionStorage.setItem(this.idKey, response.researcherId);
        this.authState.next(response);
      }));
  }

  logout(): void {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.idKey);
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

  get researcherId(): string | null {
    return this.accessToken ? this.authState.value?.researcherId ?? null : null;
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  private readStoredSession(): ResearcherLoginResponse | null {
    const accessToken = sessionStorage.getItem(this.tokenKey);
    const researcherId = sessionStorage.getItem(this.idKey);
    if (!accessToken || !researcherId || this.isExpired(accessToken)) {
      sessionStorage.removeItem(this.tokenKey);
      sessionStorage.removeItem(this.idKey);
      return null;
    }
    return {accessToken, researcherId, tokenType: 'bearer'};
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
