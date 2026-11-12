import {Component, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {AppMode, AppModeService} from './app-mode.service';

@Component({
  selector: 'app-mode-entry',
  templateUrl: './mode-entry.component.html',
  styleUrls: ['./mode-entry.component.scss']
})
export class ModeEntryComponent implements OnInit {
  constructor(public appMode: AppModeService, private router: Router) {}

  ngOnInit(): void {
    if (this.appMode.mode) {
      void this.router.navigateByUrl(this.destination(this.appMode.mode), {replaceUrl: true});
    }
  }

  select(mode: Exclude<AppMode, null>): void {
    this.appMode.select(mode);
    void this.router.navigateByUrl(this.destination(mode));
  }

  private destination(mode: Exclude<AppMode, null>): string {
    return mode === 'study' ? '/study' : '/summary';
  }
}
