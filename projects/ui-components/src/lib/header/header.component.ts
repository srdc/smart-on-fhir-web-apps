import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

export interface HeaderTab {
  label: string;
  link: string | any[];
  active?: boolean;
}

@Component({
  selector: 'ui-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent {
  @Input() logoSrc?: string;
  @Input() logoAlt = 'Logo';
  @Input() brandText = '';
  @Input() tabs: HeaderTab[] = [];
  @Input() showLogout = true;  // Show/hide logout button
  @Input() secondaryActionLabel?: string;

  @Output() logout = new EventEmitter<void>();
  @Output() secondaryAction = new EventEmitter<void>();

  loggingOut = false;

  onLogout(): void {
    this.logout.emit();
  }
}
