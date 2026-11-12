import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {map} from 'rxjs/operators';
import {StudyProgressService} from '../services/study-progress.service';

/** Allows the transitional live setup only when the active case has no record yet. */
export const studySetupGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(StudyProgressService).resolveAuthenticatedEntryDestination().pipe(
    map(destination => destination.join('/') === '/study/form'
      ? true
      : router.createUrlTree(destination))
  );
};
