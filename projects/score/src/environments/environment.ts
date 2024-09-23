const appBaseUrl = 'http://localhost:4200';
const cdsBaseUrl = 'http://localhost:8084';

export const environment = {
  smart: {
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
