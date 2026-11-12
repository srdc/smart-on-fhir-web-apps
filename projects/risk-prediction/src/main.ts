import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

interface AppRunConfig {
  runId: string;
}

const runStateKeys = [
  'app_mode',
  'study_access_token',
  'study_participant_id',
  'study_smart_return_destination'
];

async function prepareDevelopmentRun(): Promise<void> {
  try {
    const response = await fetch('assets/runtime/app-run.json', {cache: 'no-store'});
    if (!response.ok) {
      throw new Error(`Runtime configuration returned HTTP ${response.status}.`);
    }
    const config = await response.json() as AppRunConfig;
    if (!config.runId || typeof config.runId !== 'string') {
      throw new Error('Runtime configuration does not contain a valid runId.');
    }
    if (sessionStorage.getItem('app_run_id') !== config.runId) {
      runStateKeys.forEach(key => sessionStorage.removeItem(key));
      sessionStorage.setItem('app_run_id', config.runId);
    }
  } catch (error) {
    console.error('Application run initialization failed.', error);
  }
}

void prepareDevelopmentRun()
  .then(() => platformBrowserDynamic().bootstrapModule(AppModule))
  .catch(err => console.error(err));
