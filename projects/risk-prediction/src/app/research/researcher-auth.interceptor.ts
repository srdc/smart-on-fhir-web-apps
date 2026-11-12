import {HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {Observable, throwError} from 'rxjs';
import {catchError} from 'rxjs/operators';
import {environment} from '../../environments/environment';
import {ResearcherAuthService} from './researcher-auth.service';

@Injectable()
export class ResearcherAuthInterceptor implements HttpInterceptor {
  private readonly root = `${environment.studyApiBaseUrl.replace(/\/$/, '')}/study/research`;

  constructor(private auth: ResearcherAuthService, private router: Router) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const protectedRequest = request.url.startsWith(this.root) && !request.url.endsWith('/auth/login');
    const token = protectedRequest ? this.auth.accessToken : null;
    const outgoing = token ? request.clone({setHeaders: {Authorization: `Bearer ${token}`}}) : request;
    return next.handle(outgoing).pipe(catchError(error => {
      if (protectedRequest && error instanceof HttpErrorResponse && error.status === 401) {
        this.auth.logout();
        void this.router.navigate(['/research/login'], {replaceUrl: true});
      }
      return throwError(() => error);
    }));
  }
}
