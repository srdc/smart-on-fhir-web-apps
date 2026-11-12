import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {AppModeService} from './app-mode.service';

export const requireRiskPredictionMode: CanActivateFn = () => requireMode('risk_prediction');
export const requireStudyMode: CanActivateFn = () => requireMode('study');

function requireMode(expected: 'risk_prediction' | 'study'): true | ReturnType<Router['createUrlTree']> {
  const mode = inject(AppModeService).mode;
  if (mode === expected) return true;
  return inject(Router).createUrlTree(['/']);
}
