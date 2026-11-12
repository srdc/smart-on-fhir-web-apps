import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {StudyCasePhase} from '../models/study-case-progress';
import {StudyProgressService} from '../services/study-progress.service';
import {map} from 'rxjs/operators';

export const studyCasePhaseGuard: CanActivateFn = route => {
  const router = inject(Router);
  const progressService = inject(StudyProgressService);
  const caseId = route.paramMap.get('caseId') ?? route.data['studyCaseId'];
  const requestedPhase = route.data['studyPhase'] as StudyCasePhase;

  if (!caseId) {
    return router.createUrlTree(['/study']);
  }
  return progressService.authorizeCasePhase(caseId, requestedPhase, route.data['frozenStudyCase'] === true).pipe(
    map(result => result === true ? true : router.createUrlTree(result))
  );
};
