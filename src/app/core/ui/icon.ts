import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'bell'
  | 'sun'
  | 'moon'
  | 'plus'
  | 'edit'
  | 'trash'
  | 'key'
  | 'exit'
  | 'info'
  | 'download'
  | 'close'
  | 'photo'
  | 'check'
  | 'users'
  | 'home'
  | 'ban';
const paths: Record<IconName, string> = {
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5',
  plus: 'M12 5v14M5 12h14',
  edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  key: 'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM10 11v10m0-4h4m-4-3h3',
  exit: 'M9 4H4v16h5m5-15 7 7-7 7M8 12h13',
  info: 'M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  close: 'm6 6 12 12M6 18 18 6',
  photo: 'M3 3h18v18H3V3Zm0 14 6-6 5 5 3-3 4 4M16 7h.01',
  check: 'm5 12 4 4L19 6',
  users:
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-4a4 4 0 0 1 0 8',
  home: 'm3 10 9-7 9 7v11h-6v-7H9v7H3V10Z',
  ban: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M5 5l14 14',
};
@Component({
  selector: 'app-icon',
  template:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="paths[name()]" /></svg>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly paths = paths;
}
