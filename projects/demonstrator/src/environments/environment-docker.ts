// Deployment on https://kroniq.srdc.com.tr (stage-fhir-repository/deploy/kroniq), or https://stage.testing.eu locally
// (stage-fhir-repository/deploy/testing). The demonstrator must be served from the same origin as the risk-prediction
// app it embeds: they share the SMART session (localStorage) and the demonstrator follows the app's pages in the frame.
const host = window.location.origin;
const appBaseUrl = host + '/smart-apps/demonstrator';
const stage = {fhir: host + '/stage-fhir', shl: host + '/stage-shl'};
const onAuth = host + '/stage-onauth/api/smart';

export const environment = {
  smart: {
    shlServerBaseUrl: stage.shl,
    shlServerBaseUrls: {[stage.fhir]: stage.shl},
    trustedIssuers: [{iss: stage.fhir, name: 'STAGE FHIR repository'}],
    shlOwnerAuth: false,
    healthCardValueSetBaseUrl: 'http://stage-healthyaging.eu/fhir/ValueSet/',
    authStorage: <'localStorage'>'localStorage',
    logo: 'assets/stage-outline-white-cropped.png',
    title: 'Storyboards\nDemonstrator',
    shcLoginEnabled: false,
    // the visitor's patient copies and the page to open after the login stay when logging out
    keepOnLogout: ['STAGE_DEMONSTRATOR_'],
    redirectUrl: appBaseUrl + '/callback',
    // The only login: a user login without a patient context, so that the demonstrator can select the patient copies it
    // creates. The same client as 'STAGE (select patient)' of risk-prediction (its environment-docker.ts): the embedded app
    // continues with this session and reads the client configuration (interventions) from it.
    loginClients: [
      {
        label: 'STAGE',
        image: 'assets/stage-x-repofyr.png',
        iss: stage.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/',
        interventions: {
          relatedObservationMethod: '_source',
          value: 'http://stage-healthyageing.eu/data-source/LIVA'
        }
      }
    ],
    launchClients: []
  },
  cds: {
    serviceName: 'risk_prediction',
    baseUrl: stage.fhir,
    baseUrls: {[stage.fhir]: stage.fhir}
  },
  demonstrator: {
    // the risk-prediction app shown in the frame (same origin as the demonstrator)
    riskPredictionUrl: host + '/smart-apps/risk-prediction',
    // shown on the start page: how visitors log in (e.g. a public demo account), or empty
    loginHint: 'Log in with the STAGE demonstrator account given to you, or with your STAGE account.'
  }
}
