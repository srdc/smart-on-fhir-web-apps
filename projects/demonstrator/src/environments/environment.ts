// Development: `ng serve demonstrator` on http://localhost:4200 (the redirect URI registered in onAuth for smart-test),
// with the risk-prediction app served under /risk-prediction/ on port 4201 and proxied (proxy.conf.json), so that both
// run on the same origin:
//   ng serve risk-prediction --port 4201 --serve-path /risk-prediction/
// FHIR repository (stage-fhir-repository) on http://localhost:8080/fhir.
const host = window.location.origin;
const appBaseUrl = host;
const stageFhir = 'http://localhost:8080/fhir';

export const environment = {
  smart: {
    shlServerBaseUrl: 'http://localhost:3000',
    shlServerBaseUrls: {[stageFhir]: 'http://localhost:3000'},
    trustedIssuers: [{iss: stageFhir, name: 'STAGE FHIR repository'}],
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
        iss: stageFhir,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
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
    baseUrl: stageFhir,
    baseUrls: {[stageFhir]: stageFhir}
  },
  demonstrator: {
    riskPredictionUrl: host + '/risk-prediction',
    loginHint: 'Log in with a practitioner account of the local onAuth.'
  }
}
