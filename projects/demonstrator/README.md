# STAGE storyboard demonstrator

Public demonstrator of the WP7 end-to-end risk-prediction storyboards (`Documents/WP7/Storyboards`):
https://kroniq.srdc.com.tr/smart-apps/demonstrator/

- **Start page** (public): the four storyboard patients (one per WP6 model stratum) with their story and the risks
  computed for the storyboard document; "Make your own patient" (a storyboard record under another name).
- **Story** (after the login): the nine steps of the storyboard (what the user does, what happens behind the screen,
  what is particular to the patient), next to the **risk-prediction app in a frame**, following the app's pages.
- **Simulated partner applications**: the Health Monitoring App (ABACUS) shows the questionnaires the patient completed
  and stores new answers as QuestionnaireResponses; the LIVA health coach accepts the goals of the care plan and posts
  measurements (Observations with `meta.source` LIVA). They can be replaced by the partners' web interfaces later
  (`STEP_SCREENS` in `storyboard.service.ts`).

## How it works

- **Patient copies.** Each visitor works on a copy of the storyboard patient (`demo-patient.service.ts`): the baseline
  transaction of the patient with new ids (`demo-<session>-sb-pN-...`), the tag
  `http://stage-healthyaging.eu/fhir/CodeSystem/demonstrator|demo-copy` on every resource, the identifiers
  `.../demonstrator-session|<session>` and `.../storyboard-patient-copy|sb-pN` on the Patient, and the dates moved
  from the anchor date of the storyboard to today (birth dates stay: the patient stays in the stratum). The four
  storyboard patients are never changed. The browser remembers its copies and reuses them ("Start over" makes a new one).
- **Shared session.** The demonstrator logs in without a patient context (client `smart-test`, as "STAGE (select
  patient)" of risk-prediction) and selects the copy. Served from the same origin, the risk-prediction app in the frame
  continues with that session (ng-smart-on-fhir keeps it in localStorage), and the demonstrator reads and sets the
  frame's page. Both apps must stay on the same origin.
- **Frame details.** fhirclient in a frame takes a stored session for an authorization to complete in the parent (it
  posts `completeAuth` and never resolves): the story marks the session state `completeInTarget` before loading the
  frame. risk-prediction keeps its last disease selection, results and saved questionnaire per browser, not per patient
  (`questionnaire_results`, `risk_prediction_selected_diseases`, `risk_prediction_qr`): the story clears them when it
  opens another patient, otherwise the app shows the previous patient's results.
- **Before the login.** Without a saved session, `/start` and `/story` open the sign-in page (`SignInComponent`): the
  visitor plays the clinician and logs in with the test practitioner account it shows, read at run time from
  `assets/config/demo-account.json` (`{"username", "password", "note"}`, see `demo-account.example.json`). That file
  is not in git: put it there before building the image, or mount it into the container
  (`/usr/share/nginx/html/smart-apps/demonstrator/browser/assets/config/demo-account.json`). Without it the page shows
  `loginHint` of the environment.
- **After the login.** The page asked for is kept in localStorage (`ResumeComponent`), not sessionStorage, and only
  forgotten once the story has opened: ng-smart-on-fhir reloads the callback page once more after some logins.
- **What changes the risks.** `export_storyboard.py` also exports the inputs of the deployed models
  (`shap-client/data/models/*/metadata.json`, feature selection per stratum) and whether the STAGE feature extraction
  produces them; the risk questionnaire step lists the inputs a visitor can change. With poc-srdc-v0.3.1
  (`c4_survey_excl`) the questionnaires of the Health Monitoring App are not model inputs.
- **Cleanup.** `scripts/cleanup_demo_copies.py` deletes the copies older than a day with everything that references
  them (what the visitors saved). Run it daily on the deployment:

  ```
  python scripts/cleanup_demo_copies.py https://kroniq.srdc.com.tr/stage-fhir \
      --token-url https://kroniq.srdc.com.tr/stage-onauth/api/smart/token --client-id <id> --client-secret <secret>
  python scripts/cleanup_demo_copies.py <base> --token <token> --older-than-hours 0 --dry-run   # list the copies
  ```

## Storyboard content

`src/assets/storyboard/` is exported from the sources of the storyboard document (patients workbook and baseline
bundles of `fhir-path-feature-extraction/storyboard_patients`, generic steps of `Documents/WP7/Storyboards/_build/content.py`),
so that the document and the demonstrator tell the same story. After changing them (update cycle of
`storyboard_patients/README.md`):

```
python projects/demonstrator/scripts/export_storyboard.py      # STAGE_ROOT: the STAGE folder, if not ../..
```

What the visitor does in each step (`actions`) and whether the step can be left without doing it (`canSkip`) are
written in `storyboard.json` itself; the export keeps them.

The login and patient selection screenshots (`src/assets/storyboard/screenshots/`) are copies of
`Documents/WP7/Storyboards/screenshots/`.

## Development

```
ng serve risk-prediction --port 4201 --serve-path /risk-prediction/
ng serve demonstrator            # http://localhost:4200, proxies /risk-prediction to 4201 (proxy.conf.json)
```

with the FHIR repository on http://localhost:8080/fhir and its onAuth (`environment.ts`).

Or only the demonstrator locally, everything else from the testing deployment (https://stage.testing.eu,
`stage-fhir-repository/deploy/testing`, which must be running):

```
ng serve demonstrator --configuration testing   # http://localhost:4200
```

`environment-testing.ts`; `proxy.conf.testing.json` forwards `/smart-apps`, `/stage-fhir`, `/stage-shl` and
`/stage-onauth` to stage.testing.eu, so the FHIR repository and the embedded risk-prediction app (the deployed one) are
on localhost:4200. The login page and token requests go to stage.testing.eu directly; `http://localhost:4200/callback`
is a registered redirect URI of smart-test there. The CDS services take `http://localhost:4200/stage-fhir` (and port
4000) as the repository itself (`stage.cds.security.fhir-server-aliases` in `deploy/testing/application-testing.conf`);
on another port, add it there. A session left in localStorage by another app on localhost:4200 (for
example against localhost:8080) makes the demonstrator take you for logged in: log out, or clear the site data.

Or build the smart-apps image and deploy it on the testing deployment.

## Deployment

Part of the smart-apps image (`build-docker.bat`, `docker/default.conf.template`): `/smart-apps/demonstrator/`. onAuth
must accept the redirect URI `https://<host>/smart-apps/demonstrator/callback` for the client `smart-test`
(`stage-onauth/conf/realms/smart/clients/smart-test.json`, and in the running server through onauth-manager; the
testing deployment adds it in `setup.sh`).
