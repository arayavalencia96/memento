import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LiveUpdatesService } from './core/services/live-updates.service';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './core/ui/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  template: '<router-outlet /><app-toasts />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly live = inject(LiveUpdatesService);
}
