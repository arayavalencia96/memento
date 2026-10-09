import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AccessService } from '../access/access.service';

@Component({
  selector: 'app-admin-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      aria-label="Administración"
      class="mt-6 flex flex-wrap gap-2 border-b border-stone-200 pb-4 dark:border-stone-700"
    >
      <a
        routerLink="/admin"
        [routerLinkActiveOptions]="{ exact: true }"
        routerLinkActive="active"
        class="admin-tab"
        >Dashboard</a
      >
      <a routerLink="/admin/users" routerLinkActive="active" class="admin-tab">Usuarios</a>
      <a routerLink="/admin/requests" routerLinkActive="active" class="admin-tab"
        >Solicitudes
        @if (pending(); as count) {
          <span class="ml-1 rounded-full bg-[#b8674d] px-2 py-0.5 text-xs text-white">{{
            count
          }}</span>
        }
      </a>
    </nav>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminNav {
  private readonly access = inject(AccessService);
  readonly pending = this.access.pendingRequestsCount;
  constructor() {
    void this.refresh();
  }
  async refresh(): Promise<void> {
    try {
      await this.access.pendingCount();
    } catch {
      this.pending.set(0);
    }
  }
}
