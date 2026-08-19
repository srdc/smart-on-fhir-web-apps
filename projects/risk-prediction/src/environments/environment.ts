const appBaseUrl = 'http://localhost:4200';
const cdsBaseUrl = 'http://localhost:8084';

export const environment = {
  smart: {
    authStorage: <'localStorage'>'localStorage',
    shcLoginEnabled: true,
    shcCallbackUrl: '/shl',
    clientIds: {
      'https://lforms-smart-fhir.nlm.nih.gov/v/r4/fhir': 'srdc-qrisk',
      'http://launch.smarthealthit.org/v/r4/fhir': 'srdc-qrisk',
      'https://launch.smarthealthit.org/v/r4/fhir': 'srdc-qrisk',
    },
    redirectUrl: appBaseUrl + '/callback',
    loginClients: [
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
        iss: 'https://kroniq.srdc.com.tr/stage-fhir',
        isPublic: true,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        interventions: {
          relatedObservationMethod: '_source',
          value: 'http://stage-healthyageing.eu/data-source/LIVA'
        },
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
    serviceName: 'risk_prediction',
    baseUrl: cdsBaseUrl
  }
}
