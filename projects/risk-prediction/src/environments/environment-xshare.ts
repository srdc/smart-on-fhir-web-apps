// xShare (SMART Health Cards/Links) tests: the app runs locally (ng serve risk-prediction --configuration xshare) with only the
// STAGE and EHR logins; their FHIR repositories, SHL servers, onAuth and the CDS services are the ones on kroniq.srdc.com.tr
const host = 'https://kroniq.srdc.com.tr';
const appBaseUrl = 'http://localhost:4200';
const cdsBaseUrl = 'http://localhost:8084/';
const stage = {fhir: host + '/stage-fhir', shl: host + '/stage-shl'};
// second repository for the xShare (SMART Health Cards/Links) tests
const ehr = {fhir: host + '/ehr', shl: host + '/shl-ehr'};
const onAuth = host + '/stage-onauth/api/smart';

export const environment = {
  smart: {
    shlServerBaseUrl: stage.shl,
    // one SHL server per repository
    shlServerBaseUrls: {
      [stage.fhir]: stage.shl,
      [ehr.fhir]: ehr.shl
    },
    // issuers of Smart Health Cards shown by name when importing (the fhir.root-url of each repository)
    trustedIssuers: [
      {iss: stage.fhir, name: 'STAGE FHIR repository'},
      {iss: ehr.fhir, name: 'EHR'}
    ],
    // send the access token when creating links, so that users can list/revoke them with their account (needs SHL_OWNER_JWKS_URL on the SHL server)
    shlOwnerAuth: false,
    // canonical ValueSets of the CDS health card profiles, as held by stage-fhir-repository (fhir-conf/valueset/shc-<service>.json)
    healthCardValueSetBaseUrl: 'http://stage-healthyaging.eu/fhir/ValueSet/',
    authStorage: <'localStorage'>'localStorage',
    logo: 'assets/stage-outline-white-cropped.png',
    title: 'Multi-morbidity Risk Prediction &\nIntervention Planning',
    shcLoginEnabled: false,
    shcCallbackUrl: '/shl',
    redirectUrl: appBaseUrl + '/callback',
    loginClients: [
      {
        // STAGE: patients (and clinicians) log in with a patient context
        label: 'STAGE',
        image: 'assets/repofyr.png',
        color: 'white',
        iss: stage.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.* patient/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/login',
        interventions: {
          relatedObservationMethod: '_source',
          value: 'http://stage-healthyageing.eu/data-source/LIVA'
        }
      },
      {
        // EHR: clinicians log in without a patient (no launch/patient scope) and open patients by importing their
        // Smart Health Cards/Links or choosing them in the record
        label: 'EHR',
        image: 'assets/xshare-repofyr.png',
        color: 'white',
        iss: ehr.fhir,
        isPublic: false,
        redirectUri: appBaseUrl + '/callback',
        clientId: 'smart-test',
        scope: 'profile openid email roles offline_access user/*.*',
        aud: 'fhir-repo',
        promptLogin: true,
        logoutUri: onAuth + '/logout?post_logout_redirect_uri=' + appBaseUrl + '/login',
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
    baseUrl: cdsBaseUrl
  },
  riskPrediction: {
    // The risk questionnaire shows the patient's last saved response instead of collecting the data from the EHR
    // again (20-30 s) when that response is not older than this many days; the user can still re-collect it.
    savedResponseMaxAgeDays: 7
  }
}
