// Deployment on https://kroniq.srdc.com.tr (stage-fhir-repository/deploy/kroniq): STAGE, with its FHIR repository
// (also the SMART Health Card issuer) and SMART Health Links server
// The host the apps are served from: https://kroniq.srdc.com.tr, or https://stage.testing.eu locally
// (stage-fhir-repository/deploy/testing)
const host = window.location.origin;
const appBaseUrl = host + '/smart-apps/risk-prediction';
const stage = {fhir: host + '/stage-fhir', shl: host + '/stage-shl'};
const onAuth = host + '/stage-onauth/api/smart';

export const environment = {
  smart: {
    shlServerBaseUrl: stage.shl,
    // one SHL server per repository
    shlServerBaseUrls: {
      [stage.fhir]: stage.shl
    },
    // issuers of Smart Health Cards shown by name when importing (the fhir.root-url of each repository)
    trustedIssuers: [
      {iss: stage.fhir, name: 'STAGE FHIR repository'}
    ],
    // send the access token when creating links, so that users can list/revoke them with their account (needs SHL_OWNER_JWKS_URL on the SHL server)
    shlOwnerAuth: false,
    // canonical ValueSets of the CDS health card profiles, as held by stage-fhir-repository (fhir-conf/valueset/shc-<service>.json)
    healthCardValueSetBaseUrl: 'http://stage-healthyaging.eu/fhir/ValueSet/',
    authStorage: <'localStorage'>'localStorage',
    logo: 'assets/stage-outline-white-cropped.png',
    title: 'Multi-morbidity Risk Prediction &\nIntervention Planning',
    // no Smart Health Card button on the login page: patients' cards/links are imported after the STAGE login without a
    // patient (see loginClients); the /shc and /shl routes stay (app-routing.module.ts)
    shcLoginEnabled: false,
    shcCallbackUrl: '/shl',
    clientIds: {
      'https://lforms-smart-fhir.nlm.nih.gov/v/r4/fhir': 'srdc-qrisk',
      'http://launch.smarthealthit.org/v/r4/fhir': 'srdc-qrisk',
      'https://launch.smarthealthit.org/v/r4/fhir': 'srdc-qrisk',
    },
    redirectUrl: appBaseUrl + '/callback',
    loginClients: [
      {
        // STAGE: patients (and clinicians) log in with a patient context
        label: 'STAGE',
        image: 'assets/stage-x-repofyr.png',
        iss: stage.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/login',
        interventions: {
          relatedObservationMethod: '_source',
          value: 'http://stage-healthyageing.eu/data-source/LIVA'
        }
      },
      {
        // STAGE without a patient context (no launch/patient): clinicians choose a patient in the record or import
        // the patient's Smart Health Card/Link (the patient selection page)
        label: 'STAGE (select patient)',
        image: 'assets/scan-shc.png',
        iss: stage.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/login',
        interventions: {
          relatedObservationMethod: '_source',
          value: 'http://stage-healthyageing.eu/data-source/LIVA'
        }
      },
      {
        label: 'EPIC',
        image: 'https://fhir.epic.com/Content/images/EpicOnFhir.png',
        iss: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/',
        redirectUri: appBaseUrl + '/callback',
        clientId: '9dc58e42-28ea-446c-8a07-40b169a5b112',
        scope: 'launch launch/patient patient/*.*'
      }
    ],
    launchClients: [
      {
        label: 'Smart Health IT',
        image: 'https://apps.smarthealthit.org/logo.svg',
        url: 'https://launch.smarthealthit.org/launcher?launch_uri=' + encodeURIComponent(appBaseUrl + '/launch') + '&fhir_ver=4'
      }
    ]
  },
  // The CDS services of each repository are at <FHIR base>/cds-hooks: calls go to the repository the user is logged in
  // to (the fhirServer of the call), the others (e.g. definitions) to STAGE
  cds: {
    serviceName: 'risk_prediction',
    baseUrl: stage.fhir,
    baseUrls: {[stage.fhir]: stage.fhir}
  },
  riskPrediction: {
    // The risk questionnaire shows the patient's last saved response instead of collecting the data from the EHR
    // again (20-30 s) when that response is not older than this many days; the user can still re-collect it.
    savedResponseMaxAgeDays: 7,
    // The app's page in the dashboard (description and how well the models predict), opened from the results
    dashboardDetailsUrl: host + '/smart-apps/dashboard/app/stage-risk-prediction'
  }
}
