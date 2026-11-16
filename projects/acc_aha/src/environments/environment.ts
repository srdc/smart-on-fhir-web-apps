const appBaseUrl = 'http://localhost:4200';
const cdsBaseUrl = 'http://localhost:8084';

export const environment = {
  smart: {
    // no Smart Health Card button on the login page: patients' cards/links are imported after the STAGE login without a
    // patient (see loginClients)
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
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
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
    serviceName: 'acc_aha',
    baseUrl: cdsBaseUrl
  }
}
