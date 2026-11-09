const appBaseUrl = 'https://kroniq.srdc.com.tr/smart-apps/shc-generator';
const cdsBaseUrl = 'https://kroniq.srdc.com.tr/smart-cds';

export const environment = {
  smart: {
    logo: 'assets/stage-outline-white-cropped.png',
    title: 'SMART HEALTH CARD GENERATOR',
    shlServerBaseUrl: 'https://kroniq.srdc.com.tr/stage-shl',
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
        clientId: '9dc58e42-28ea-446c-8a07-40b169a5b112',
        scope: 'launch launch/patient patient/*.*'
      },
      {
        label: 'Kroniq',
        image: 'https://kroniq.health/img/kroniq-colored.png',
        iss: 'https://kroniq.srdc.com.tr/fhir',
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: 'https://kroniq.srdc.com.tr/onauth/api/adlife/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
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
  cds: {
    baseUrl: cdsBaseUrl
  }
}
