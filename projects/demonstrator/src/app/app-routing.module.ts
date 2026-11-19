import {inject, NgModule} from '@angular/core';
import {CanActivateFn, Router, RouterModule, Routes} from '@angular/router';
import {withSmartHandlerRoutes} from 'ng-smart-on-fhir';
import {HomeComponent} from './home/home.component';
import {StartComponent} from './start/start.component';
import {StoryComponent} from './story/story.component';
import {ResumeComponent} from './start/resume.component';
import {SignInComponent} from './start/sign-in.component';

/**
 * Before the login guard of ng-smart-on-fhir (withSmartHandlerRoutes): without a saved session, remember the page asked
 * for, so that ResumeComponent opens it after the login (e.g. a story link), and explain the login first (SignInComponent)
 */
const rememberTarget: CanActivateFn = (route, state) => {
  // read the saved session without SmartAuthService.restoreSession: that loads it into the service, and the login
  // guard then takes the user for logged in and never starts the SMART client
  let saved = false;
  try {
    saved = !!(sessionStorage.getItem('SMART_APPS_SESSION') || localStorage.getItem('SMART_APPS_SESSION'));
  } catch { /* storage unavailable */ }
  if (!saved) {
    ResumeComponent.remember(state.url);
    return inject(Router).createUrlTree(['/sign-in']);
  }
  return true;
};

const routes: Routes = [
  // public: the storyboard patients and their stories
  {path: '', component: HomeComponent, pathMatch: 'full'},
  // after the login: back to the page that asked for it
  {path: 'resume', component: ResumeComponent},
  // before the login: the test practitioner account, and the login button
  {path: 'sign-in', component: SignInComponent},
  ...withSmartHandlerRoutes([
    // copy a storyboard patient (or reuse this browser's copy) and open its story
    {path: 'start/:storyId', component: StartComponent, canActivate: [rememberTarget]},
    // the story of a patient copy, with the risk-prediction app
    {path: 'story/:patientId', component: StoryComponent, canActivate: [rememberTarget]}
  ], '/resume', 'client', true, false),
  {path: '**', redirectTo: ''}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
