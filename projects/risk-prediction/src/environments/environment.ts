const appBaseUrl = 'http://localhost:4200';
// CDS services of the local repositories (stage-fhir-repository, application-stage.conf / application-ehr.conf)
const stageFhir = 'http://localhost:8080/fhir';
const ehrFhir = 'http://localhost:8180/fhir';

export const environment = {
  smart: {
    shlServerBaseUrl: 'http://localhost:3000',
    // one SHL server per repository (shl-server with .env.stage / .env.ehr)
    shlServerBaseUrls: {
      'http://localhost:8080/fhir': 'http://localhost:3000',
      'http://localhost:8180/fhir': 'http://localhost:3001'
    },
    // issuers of Smart Health Cards shown by name when importing (the fhir.root-url of each repository)
    trustedIssuers: [
      {iss: 'http://127.0.0.1:8080/fhir', name: 'STAGE FHIR repository'},
      {iss: 'http://127.0.0.1:8180/fhir', name: 'EHR'},
    ],
    // send the access token when creating links, so that users can list/revoke them with their account (needs SHL_OWNER_JWKS_URL on the SHL server)
    shlOwnerAuth: false,
    // canonical ValueSets of the CDS health card profiles, as held by stage-fhir-repository (fhir-conf/valueset/shc-<service>.json)
    healthCardValueSetBaseUrl: 'http://stage-healthyaging.eu/fhir/ValueSet/',
    authStorage: <'localStorage'>'localStorage',
    logo: 'assets/stage-outline-white-cropped.png',
    title: 'Multi-morbidity Risk Prediction &\nIntervention Planning',
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
        label: 'Kroniq',
        // image: 'https://kroniq.health/img/kroniq-colored.png',
        image: 'assets/stage-x-repofyr.png',
        iss: 'http://localhost:8080/fhir',
        // iss: 'https://kroniq.srdc.com.tr/stage-fhir',
        // isPublic: true,
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
      },
      {
        // second repository for the xShare tests (stage-fhir-repository, application-ehr.conf): clinicians log in without a patient
        // (no launch/patient scope) and open patients by importing their Smart Health Cards/Links
        label: 'EHR',
        image: 'assets/xshare-repofyr.png',
        color: 'white',
        // iss: 'http://localhost:8180/fhir',
        iss: 'https://kroniq.srdc.com.tr/ehr',
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        interventions: {
          relatedObservationMethod: '_source',
          value: 'http://stage-healthyageing.eu/data-source/LIVA'
        }
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
    serviceName: 'risk_prediction',
    // <FHIR base>/cds-hooks of the repository the user is logged in to
    baseUrl: stageFhir,
    baseUrls: {[stageFhir]: stageFhir, [ehrFhir]: ehrFhir}
  },
  riskPrediction: {
    // The risk questionnaire shows the patient's last saved response instead of collecting the data from the EHR
    // again (20-30 s) when that response is not older than this many days; the user can still re-collect it.
    savedResponseMaxAgeDays: 7
  }
}
