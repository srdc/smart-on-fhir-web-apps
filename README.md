# SmartApps

Clinical Decision Support service interfaces supporting SMARt-on-FHIR integration and CDS Hooks standard, generated with [Angular CLI](https://github.com/angular/angular-cli) version 17.3.7.

If you don't have Angular CLI installed, check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

Clone the project and install the npm dependencies:

```
git clone https://github.com/srdc/smart-on-fhir-web-apps.git
cd smart-apps
npm install
```

## Live Demo

Visit the live demo at [SRDC deployment](https://kroniq.srdc.com.tr/smart-apps/qrisk3/login).

You can use the different login options provided. For epic, use the test practitioner account and example patients specified in their [docs](https://fhir.epic.com/Documentation?docId=testpatients).

After logging in and selecting a patient, the patient data will be retrieved automatically form the connected FHIR server.
Fill in the missing data and click save to see the calculated QRISK3 score and suggestions to reduce the risk.
You can see the simulated risk if a suggestion is performed by the patient by checking the boxes next to the suggestions.

## Architecture

The project consists of 3 libraries:

- **smart-on-fhir**: A library to manage SMART authentication flows by providing `Login`, `Callback` and `Launch` components, and `SmartOnFhirService` 
service for retrieving data from the integrated FHIR servers.
- **cds-hooks**: A library to communicate with CDS-Hooks based clinical decision support servers. The library is extended by `CDSStore`
service which allows storing and subscribing to states of CDS related data by using Angular Signals.
- **common**: A library for commonly used custom implementations with services and components. The `common` library imports `CDSHooksModule` and
extends the `CDSHooksService` by custom methods commonly used in the child applications.

And 5 applications which are the user interfaces for the CDS services implemented in [the smart-cds project](https://github.com/srdc/smart-on-fhir-cds.git):
- **acc_aha**: Interface for [ACC/AHA](https://www.acc.org/Guidelines) service
- **advance**: Interface for [ADVANCE](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3902381/) service
- **qrisk**: Interface for [QRISK2](https://qrisk.org/) service
- **qrisk3**: Interface for [QRISK3](https://qrisk.org/) service
- **score2**: Interface for [SCORE2](https://www.escardio.org/Education/Practice-Tools/CVD-prevention-toolbox/SCORE-Risk-Charts) service

Even the application codes are simple and similar, the Angular Monorepo architecture is chosen so the service interfaces can be deployed as separate applications.

## Build Libraries

Before running development server or building the applications, you should build the libraries in the following order:

```
ng build smart-on-fhir
ng build cds-hooks
ng build common
```

## Development server

After building the libraries, run

```
ng serve <application name>
```

for a dev server (e.g. `ng serve qrisk`).

Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Extend with New Applications

You can develop your own CDS Hooks or FHIR applications easily using the existing libraries. Run

```
ng generate application <application name> --no-standalone
```

Angular CLI will generate an application and add the necessary configurations in the `angular.json` file.

Open the `angular.json` file and add the bootstrap CSS file to your application's style configuration:

```
      "<application name>":
        ...
        "styles": [
          "node_modules/bootstrap/dist/css/bootstrap.min.css",
          ...
        ]
```

Open the `app-routing.module.ts` (if not exists, check the Angular docs to learn how to add routing), and add wrap your routes
with the SMART routes from the `smart-on-fhir` library:

```
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {withSmartHandlerRoutes} from "smart-on-fhir";

/*
- 2nd argument indicates the path to the redirect after logged in.
- You can set the 3rd argument to 'launch', 'client' or 'both' indicating which SMART login methods you want to use.
- Set the 4th argument to false if you don't want to redirect unauthorized users to login page.
*/
const routes: Routes = withSmartHandlerRoutes([
  // your application's routes...
], '/', 'both', true);

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

```

In your `app.module.ts`, import the `SmartCommonModule` from the `common` library with necessary configurations (see the example applications for
configuring the library using environments),

```
import {SmartCdsCommonModule} from "common";

@NgModule({
  ...
  imports: [
    ...,
    SmartCdsCommonModule.forRoot(config)
  ]
})
export class AppModule { }

```

By importing the `SmartCdsCommonModule`, the components and services from the SMARt-on-FHIR and CDS-Hooks libraries will be available
in your application. You can use them by injecting to your components.

```
import {SmartOnFhirService} from "smart-on-fhir";
import {StatefulCdsService} from "common";

@Component({
  selector: 'example-component',
  templateUrl: './example.component.html',
  styleUrl: './example.component.scss'
})
export class ExampleComponent {
  constructor(private sof: SmartOnFhirService, private statefulCdsService: StatefulCdsService) {
  }
  
  fetchConditions() {
    this.sof.search('Condition', { subject: 'Patient/example', _sort: '-_lastUpdated' }).then(...)
  }
  
}

```

## Build

After building the libraries, run

```
ng build <application name>
```

to build the selected application. The build artifacts will be stored in the `dist/` directory.

## Build as Docker

You can find the Dockerfile in the `docker/` folder which creates a single container with `nginx` including all the existing
applications. You can build the libraries and applications:

```
call ng build smart-on-fhir
call ng build cds-hooks
call ng build common
call ng build qrisk2 --configuration production --base-href /smart-apps/qrisk/ --deploy-url /smart-apps/qrisk/
call ng build qrisk3 --configuration production --base-href /smart-apps/qrisk3/ --deploy-url /smart-apps/qrisk3/
call ng build advance --configuration production --base-href /smart-apps/advance/ --deploy-url /smart-apps/advance/
call ng build acc_aha --configuration production --base-href /smart-apps/acc_aha/ --deploy-url /smart-apps/acc_aha/
call ng build score2 --configuration production --base-href /smart-apps/score2/ --deploy-url /smart-apps/score2/
```

Then, build the docker image:

```
docker build -t srdc/smart-apps -f ./docker/Dockerfile .
```

Or use the `build-docker.bat` script on Windows. Finally, run the image with provided docker compose file:

```
docker compose -f ./docker/docker-compose.yml up -d
```

You can edit the build script and Dockerfile to add/remove applications from the resulting docker image.
