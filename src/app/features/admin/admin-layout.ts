import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminNav } from './admin-nav';
import { Header } from '../../core/ui/header';
@Component({
  selector: 'app-admin-layout',
  imports: [Header, AdminNav],
  template:
    '<app-header /><main class="page"><app-admin-nav /><div class="py-8"><ng-content /></div></main>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {}
