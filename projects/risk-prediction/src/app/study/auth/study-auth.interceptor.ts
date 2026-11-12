import {Injectable} from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import {Router} from '@angular/router';
import {Observable, throwError} from 'rxjs';
import {catchError} from 'rxjs/operators';
import {environment} from '../../../environments/environment';
import {StudyAuthService} from './study-auth.service';

@Injectable()
export class StudyAuthInterceptor implements HttpInterceptor {
  private readonly studyRoot = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study/`;
  private readonly researcherRoot = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study/research`;

  constructor(private auth: StudyAuthService, private router: Router) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const isStudyRequest = request.url.startsWith(this.studyRoot);
    const isResearchRequest = request.url.startsWith(this.researcherRoot);
    const isLoginRequest = request.url === `${this.studyRoot}auth/login`;
    const token = isStudyRequest && !isResearchRequest && !isLoginRequest ? this.auth.accessToken : null;
    const authenticatedRequest = token
      ? request.clone({setHeaders: {Authorization: `Bearer ${token}`}})
      : request;

    return next.handle(authenticatedRequest).pipe(catchError(error => {
      if (isStudyRequest && !isResearchRequest && !isLoginRequest && error instanceof HttpErrorResponse && error.status === 401) {
        this.auth.logout();
        void this.router.navigate(['/study/login'], {
          queryParams: {reason: 'expired'},
          replaceUrl: true
        });
      }
      return throwError(() => error);
    }));
  }
}
