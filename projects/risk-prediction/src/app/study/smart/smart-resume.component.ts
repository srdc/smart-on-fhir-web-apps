import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {StudySmartContextService} from './study-smart-context.service';
import {AppModeService} from '../../mode-entry/app-mode.service';

@Component({selector: 'app-smart-resume', template: ''})
export class SmartResumeComponent implements OnInit {
  constructor(
    private context: StudySmartContextService,
    private appMode: AppModeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.context.consume();
    const destination = this.appMode.mode === 'study'
      ? '/study'
      : this.appMode.mode === 'risk_prediction' ? '/summary' : '/';
    void this.router.navigateByUrl(destination, {replaceUrl: true});
  }
}
