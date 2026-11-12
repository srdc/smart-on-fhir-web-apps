import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {StudyProgressService} from '../services/study-progress.service';
import {map} from 'rxjs/operators';

export const studyStageGuard: CanActivateFn = route => {
  const router = inject(Router);
  const progressService = inject(StudyProgressService);
  const requestedStage = route.data['studyStage'] as 'POST_A' | 'POST_B' | 'COMPARE_ORIENTATION' | 'COMPARE' | 'INTERVIEW' | 'COMPLETE';

  return progressService.authorizeStage(requestedStage).pipe(
    map(result => result === true ? true : router.createUrlTree(result))
  );
};
