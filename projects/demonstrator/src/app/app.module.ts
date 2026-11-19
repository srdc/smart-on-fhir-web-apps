import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {HttpClientModule} from '@angular/common/http';
import {FormsModule} from '@angular/forms';
import {SmartCdsCommonModule} from 'common';
import {HeaderModule} from 'ui-components';
import {environment} from '../environments/environment';
import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HomeComponent} from './home/home.component';
import {StartComponent} from './start/start.component';
import {ResumeComponent} from './start/resume.component';
import {SignInComponent} from './start/sign-in.component';
import {StoryComponent} from './story/story.component';
import {AppFrameComponent} from './story/app-frame.component';
import {AbacusSimulatorComponent} from './simulators/abacus-simulator.component';
import {LivaSimulatorComponent} from './simulators/liva-simulator.component';
import {RiskChartComponent} from './home/risk-chart.component';

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    RiskChartComponent,
    StartComponent,
    ResumeComponent,
    SignInComponent,
    StoryComponent,
    AppFrameComponent,
    AbacusSimulatorComponent,
    LivaSimulatorComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    SmartCdsCommonModule.forRoot(environment),
    HeaderModule
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
