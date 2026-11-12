import {inject} from '@angular/core';
import {CanActivateFn} from '@angular/router';
import {StudySmartContextService} from './study-smart-context.service';

/** Runs before the library SMART guard so its fixed callback cannot erase Study mode. */
export const studySmartIntentGuard: CanActivateFn = (_route, state) => {
  inject(StudySmartContextService).preserve(state.url);
  return true;
};
