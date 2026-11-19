// Development against the testing deployment (stage-fhir-repository/deploy/testing): only the demonstrator runs locally,
// everything else comes from https://stage.testing.eu:
//   ng serve demonstrator --configuration testing
// then open http://localhost:4200 (the redirect URI registered in onAuth for smart-test).
//
// proxy.conf.testing.json forwards /smart-apps, /stage-fhir, /stage-shl and /stage-onauth to stage.testing.eu, so that the
// FHIR repository and the embedded risk-prediction app are on the demonstrator's origin: the app in the frame shares the
// SMART session and reads its configuration by the issuer, which it builds from its own origin (host + '/stage-fhir').
// The login itself and the token requests go to stage.testing.eu directly (the endpoints of its smart-configuration).
const host = window.location.origin;
const appBaseUrl = host;
const testing = 'https://stage.testing.eu';
const stage = {fhir: host + '/stage-fhir', shl: host + '/stage-shl'};
const onAuth = testing + '/stage-onauth/api/smart';

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
    // the risk-prediction app deployed on stage.testing.eu, through the proxy
    riskPredictionUrl: host + '/smart-apps/risk-prediction',
    loginHint: 'Log in with a practitioner account of stage.testing.eu.'
  }
}
