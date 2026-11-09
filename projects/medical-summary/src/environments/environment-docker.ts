// The host the apps are served from: https://kroniq.srdc.com.tr, or https://stage.testing.eu locally
// (stage-fhir-repository/deploy/testing)
const host = window.location.origin;
const appBaseUrl = host + '/smart-apps/medical-summary';
// STAGE and EHR repositories (stage-fhir-repository/deploy/kroniq)
const stage = {fhir: host + '/stage-fhir'};
const ehr = {fhir: host + '/ehr'};
const onAuth = host + '/stage-onauth/api/smart';

export const environment = {
  smart: {
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
      },
      {
        // STAGE: login with a patient context
        label: 'STAGE',
        background: '#2c5f2d',
        color: 'white',
        iss: stage.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
      },
      {
        // EHR: login with a patient context
        label: 'EHR',
        background: '#1f4e79',
        color: 'white',
        iss: ehr.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access launch/patient user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
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
    serviceName: 'qrisk3',
    baseUrl: stage.fhir,
    baseUrls: {[stage.fhir]: stage.fhir, [ehr.fhir]: ehr.fhir}
  }
}
