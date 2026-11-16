const appBaseUrl = 'http://localhost:4201';
// CDS services of the local repository (stage-fhir-repository)
const stageFhir = 'http://localhost:8080/fhir';

export const environment = {
  smart: {
    shlServerBaseUrl: 'http://localhost:3000',
    // one SHL server per repository
    shlServerBaseUrls: {
      'http://localhost:8080/fhir': 'http://localhost:3000'
    },
    // issuers of Smart Health Cards shown by name when importing (the fhir.root-url of each repository)
    trustedIssuers: [
      {iss: 'http://127.0.0.1:8080/fhir', name: 'STAGE FHIR repository'},
    ],
    // send the access token when creating links, so that users can list/revoke them with their account (needs SHL_OWNER_JWKS_URL on the SHL server)
    shlOwnerAuth: false,
    // canonical ValueSets of the CDS health card profiles, as held by stage-fhir-repository (fhir-conf/valueset/shc-<service>.json)
    healthCardValueSetBaseUrl: 'http://stage-healthyaging.eu/fhir/ValueSet/',
    logo: 'assets/stage-outline-white-cropped.png',
    authStorage: <'localStorage'>'localStorage',
    title: 'QRISK3 CALCULATOR',
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
        label: 'STAGE',
        image: 'assets/stage-x-repofyr.png',
        iss: 'http://localhost:8080/fhir',
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: 'http://127.0.0.1:8091/api/smart/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
      },
      {
        // STAGE without a patient context (no launch/patient): clinicians choose a patient in the record or import
        // the patient's Smart Health Card/Link (the patient selection page)
        label: 'STAGE (select patient)',
        image: 'assets/scan-shc.png',
        iss: 'http://localhost:8080/fhir',
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: 'http://127.0.0.1:8091/api/smart/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
      },
      {
        label: 'EPIC',
        image: 'https://fhir.epic.com/Content/images/EpicOnFhir.png',
        iss: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/',
        redirectUri: appBaseUrl + '/callback',
        clientId: '43a60ffa-242a-4bbe-bb17-97666be7189e',
        scope: 'launch launch/patient patient/*.*'
      }
    ],
    launchClients: [
      {
        label: 'Smart Health IT',
        image: 'https://apps.smarthealthit.org/logo.svg',
        url: 'https://launch.smarthealthit.org/launcher?launch_uri=' + encodeURIComponent(appBaseUrl + '/launch') + '&fhir_ver=4'
      },
      {
        label: 'NIH - Smart Launch',
        background: '#326295',
        color: 'white',
        url: 'https://lforms-smart-fhir.nlm.nih.gov/'
      }
    ]
  },
  cds: {
    serviceName: 'qrisk3',
    // <FHIR base>/cds-hooks of the repository the user is logged in to
    baseUrl: stageFhir,
    baseUrls: {[stageFhir]: stageFhir}
  }
}
