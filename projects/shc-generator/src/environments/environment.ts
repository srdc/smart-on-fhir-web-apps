const appBaseUrl = 'http://localhost:4200';
const cdsBaseUrl = 'http://localhost:8084';

export const environment = {
  smart: {
    logo: 'assets/stage-outline-white-cropped.png',
    title: 'SMART HEALTH CARD GENERATOR',
    shlServerBaseUrl: 'http://localhost:3000',
    clientIds: {
      'https://lforms-smart-fhir.nlm.nih.gov/v/r4/fhir': 'srdc-qrisk',
      'http://launch.smarthealthit.org/v/r4/fhir': 'srdc-qrisk',
      'https://launch.smarthealthit.org/v/r4/fhir': 'srdc-qrisk',
      'https://fhir-ehr-code.cerner.com/r4/bea30cf0-b6fb-4f91-9a7c-7dcd5e24bd3f': 'd907dee6-41b2-43cd-a32a-31e19ada06e8',
      'http://127.0.0.1:8091/api/adlife/': 'smart-test'
    },
    redirectUrl: appBaseUrl + '/callback',
    loginClients: [
      {
        label: 'Cerner',
        image: 'https://logos-world.net/wp-content/uploads/2020/09/Oracle-Logo.png',
        iss: 'https://fhir-myrecord.cerner.com/r4/bea30cf0-b6fb-4f91-9a7c-7dcd5e24bd3f',
        redirectUri: appBaseUrl + '/callback',
        clientId: 'd907dee6-41b2-43cd-a32a-31e19ada06e8',
        scope: 'launch launch/patient profile patient/Patient.read'
      },
      {
        label: 'EPIC',
        image: 'https://fhir.epic.com/Content/images/EpicOnFhir.png',
        iss: 'https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4/',
        redirectUri: appBaseUrl + '/callback',
        clientId: '43a60ffa-242a-4bbe-bb17-97666be7189e',
        scope: 'launch launch/patient patient/*.*'
      },
      {
        label: 'Kroniq',
        image: 'https://kroniq.health/img/kroniq-colored.png',
        iss: 'http://localhost:8080/fhir',
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        isPublic: false,
        // logoutUri: 'http://127.0.0.1:8091/api/smart/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
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
    baseUrl: cdsBaseUrl
  }
}
