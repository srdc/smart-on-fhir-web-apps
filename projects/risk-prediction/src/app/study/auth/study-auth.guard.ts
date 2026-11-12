import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {StudyAuthService} from './study-auth.service';

export const studyAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(StudyAuthService);
  const router = inject(Router);
  return auth.isAuthenticated
    ? true
    : router.createUrlTree(['/study/login'], {queryParams: {returnUrl: state.url}});
};
