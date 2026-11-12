import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {ResearcherAuthService} from './researcher-auth.service';

export const researcherAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(ResearcherAuthService);
  const router = inject(Router);
  return auth.isAuthenticated ? true : router.createUrlTree(['/research/login'], {
    queryParams: {returnUrl: state.url}
  });
};
