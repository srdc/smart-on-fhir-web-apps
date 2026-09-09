import {AppMetadata} from "./AppMetadata";
const appBaseUrl = 'https://stage.testing.eu/home';

export const environment = {
  appSections: <{title: string, apps: AppMetadata[]}[]>[{
    title: 'STAGE Integrated Tools',
    apps: [
      {
        id: 'stage-risk-prediction',
        title: 'STAGE Multi-morbidity Risk Prediction',
        description: 'Person-centred digital health platform developed within the European Commission-funded STAGE Project. It predicts the risk of multimorbidity and chronic diseases by integrating data from electronic health records, patient-reported outcomes, and monitoring devices',
        url: 'http://localhost:4202/',
        img: 'assets/stage-circle-blue-text.png',
        metadata: {
          smartAppId: '0000-0000-0000-0001',
          modelCardUrl: 'assets/model-cards/stage/model_card_metadata.json',
          modelCardPipelineUrl: 'assets/model-cards/stage/model_card_pipeline.json',
          name: 'STAGE Integrated Multi-morbidity Risk Prediction Tools',
          version: '1',
          keywords: ['Multimorbidity', 'Healthy Aging', 'AI'],
          description: 'Person-centred digital health platform developed within the European Commission-funded STAGE Project. It predicts the risk of multimorbidity and chronic diseases by integrating data from electronic health records, patient-reported outcomes, and monitoring devices',
          category: ['Risk Calculation', 'Disease Management'],
          healthTheme: ['https://www.wikidata.org/wiki/Q7265536', 'https://www.wikidata.org/wiki/Q5133829'],
          publisher: 'SRDC A.Ş.',
          trlLevel: '4',
          license: 'Open Source',
          contactPoint: 'info@srdc.com.tr',
          primaryUse: 'Disease risk predictions',
          secondaryUse: '',
          intendedUsers: 'Clinicians',
          contraindications: '',
          ethicalConsiderations: '',
          limitations: [],
          createdAt: '2026-01-01',
          createdBy: 'SRDC A.Ş.',
          lastUpdatedAt: '2026-04-09',
          lastUpdatedBy: 'SRDC A.Ş.',
          fhirCompatibility: 'FHIR R4',
          landingPage: 'https://stage.healthyaging.eu',
          smartLaunchURI: 'https://kroniq.srdc.com.tr/smart-apps/risk-prediction/launch',
          redirectURIs: ['https://kroniq.srdc.com.tr/smart-apps/risk-prediction/callback'],
        }
        // metadata: [{
        //   label: 'Project Home',
        //   value: 'stage-healthyaging.eu',
        //   href: 'https://stage-healthyaging.eu',
        // }, {
        //   label: 'Dataset',
        //   value: 'NFBC Cohort data'
        // }]
      }
    ]
  }, {
    title: 'Risk Calculators',
    apps: [
      {
        id: 'advance',
        title: 'ADVANCE',
        description: 'The ADVANCE risk model is derived from the ADVANCE trial and is specifically designed for individuals with type 2 diabetes. It predicts the risk of major cardiovascular events (such as myocardial infarction or stroke) and mortality using variables like age, duration of diabetes, HbA1c, blood pressure, lipid levels, and renal function.',
        url: 'http://localhost:4203/',
        // img: '/assets/cvd_diabetes.png',
        metadata: {
          category: ['Risk Calculation'],
          keywords: ['Disease Risk', 'Diabetes', 'CVD']
        },
        // metadata: [{
        //   label: 'Algorithm',
        //   value: 'ADVANCE'
        // }, {
        //   label: 'Publication',
        //   value: 'doi: 10.5830/CVJA-2013-078',
        //   href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3902381/'
        // }]
      }, {
        id: 'score2',
        title: 'SCORE2',
        description: 'SCORE is a European risk estimation system used to calculate the 10-year risk of fatal cardiovascular disease. It is based on large European cohort data and uses factors such as age, sex, smoking status, systolic blood pressure, and total cholesterol. Variants exist for high- and low-risk European populations.',
        url: 'http://localhost:4204/',
        // img: '/assets/cvd_diabetes.png',
        metadata: {
          category: ['Risk Calculation'],
          keywords: ['Heart Disease Risk', 'CVD', 'ESC']
        },
        // metadata: [{
        //   label: 'Algorithm',
        //   value: 'ESC SCORE2',
        //   href: 'https://www.escardio.org/guidelines/practice-tools/cvd-prevention-toolbox/score-risk-charts/'
        // }, {
        //   label: 'Publication',
        //   value: 'https://doi.org/10.1093/eurheartj/ehab309',
        //   href: 'https://doi.org/10.1093/eurheartj/ehab309'
        // }]
      }, {
        id: 'acc-aha',
        title: 'ACC/AHA ASCVD Risk Calculator',
        description: 'Developed by the American College of Cardiology and American Heart Association, this algorithm estimates the 10-year and lifetime risk of atherosclerotic cardiovascular disease (ASCVD).',
        url: 'http://localhost:4205/',
        metadata: {
          category: ['Risk Calculation'],
          keywords: ['Disease Risk', 'CVD', 'ASCVD']
        },
        // metadata: [{
        //   label: 'Algorithm',
        //   value: 'ACC/AHA',
        //   href: 'https://tools.acc.org/CVD-Risk-Estimator-Plus/#!/calculate/estimate/'
        // }, {
        //   label: 'Publication',
        //   value: 'doi:10.1161/01.cir.0000437741.48606.98',
        //   href: 'https://www.ahajournals.org/doi/10.1161/01.cir.0000437741.48606.98'
        // }]
      }, {
        id: 'qrisk3',
        title: 'QRISK Score Calculator',
        description: 'This Smart App implements the QRISK®3-2018 calculator, a widely used tool in the NHS to estimate a patient’s 10-year risk of developing cardiovascular disease (CVD). It integrates with any EHR supporting SMART on FHIR, retrieves patient data, and generates risk scores along with CDS Hooks–based recommendations. The tool is designed to help identify high-risk individuals for further clinical assessment. It is open-source and intended for research use only.',
        url: 'http://localhost:4206/',
        img: 'assets/cvd.png',
        metadata: {
          smartAppId: '550e8400-e29b-41d4-a716-446655440000',
          modelReference: 'https://qrisk.org/',
          modelVersion: '3',
          name: 'QRISK3 Calculator',
          version: '2',
          keywords: ['QRISK', 'CVD', 'Risk assessment', '10 year risk'],
          description: 'This is a Smart App that implements the QRISK®3-2018 risk calculator. QRISK®3 is the new name for a well-established cardiovascular disease (CVD) risk score, the latest version of a score which has been in use across the NHS since 2009. It is designed to identify people at high risk of developing CVD who need to be recalled and assessed in more detail to reduce their risk of developing CVD. The score estimates the risk of a person developing CVD over the next 10 years. It has been specifically developed by doctors and academics for use in the UK.\n' +
            'This Smart App can connect to any EHR supporting Smart on FHIR Authortization guidelines. It calculates QRISK score for the selected patient and generates recommendations using CDS-Hooks. The application is intended to be used for research purposes only. The application is open-source and accessable through following links:\n' +
            'https://github.com/srdc/smart-on-fhir-web-apps\n' +
            'https://github.com/srdc/smart-on-fhir-cds\n' +
            'QRISK® is a trademark jointly held by the University of Nottingham and EMIS.',
          category: ['Risk Calculation', 'Disease Management'],
          healthTheme: ['https://www.wikidata.org/wiki/Q7265536', 'https://www.wikidata.org/wiki/Q5133829'],
          publisher: 'SRDC A.Ş.',
          trlLevel: '4',
          license: 'Open Source',
          contactPoint: 'info@srdc.com.tr',
          primaryUse: 'Estimating the risk of a person developing CVD over the next 10 years.',
          secondaryUse: '',
          intendedUsers: 'Clinicians',
          contraindications: 'The application is intended to be used for research purposes only.',
          ethicalConsiderations: 'The application is intended to be used for research purposes only. Although it includes ethnicity, categories are coarse and may not reflect local population diversity.',
          limitations: ['Does not support DSTU 2, STU3 FHIR versions', 'UK-specific model', 'QRISK algorithm is built on UK GP data patterns, which may differ in coding practices, screening frequency, and disease prevalence'],
          createdAt: '2024-01-09',
          createdBy: 'SRDC A.Ş.',
          lastUpdatedAt: '2024-11-12',
          lastUpdatedBy: 'SRDC A.Ş.',
          fhirCompatibility: 'FHIR R4',
          landingPage: 'https://kroniq.srdc.com.tr/smart-apps/qrisk3/',
          smartLaunchURI: 'https://kroniq.srdc.com.tr/smart-apps/qrisk3/launch',
          redirectURIs: ['https://kroniq.srdc.com.tr/smart-apps/qrisk3/callback'],
        }
        // metadata: [{
        //   label: 'Algorithm',
        //   value: 'QRISK3',
        //   href: 'https://qrisk.org/'
        // }, {
        //   label: 'Publication',
        //   value: 'doi: https://doi.org/10.1136/bmj.j2099',
        //   href: 'https://www.bmj.com/content/357/bmj.j2099'
        // }]
      }
    ]
  }],
  smart: {
    shcLoginEnabled: false,
    authStorage: <'localStorage'>'localStorage',
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
        logoutUri: 'http://127.0.0.1:8091/api/smart/logout?post_logout_redirect_uri=' + appBaseUrl + '/login'
      }
    ]
  }
}
