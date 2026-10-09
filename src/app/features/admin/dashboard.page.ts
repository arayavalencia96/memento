import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthStore } from '../../core/stores/auth.store';
import { Icon } from '../../core/ui/icon';
@Component({
  selector: 'app-admin-stats',
  imports: [RouterLink, Icon],
  template: `<p class="eyebrow">Tu rincón de recuerdos</p>
    <h1 class="page-title mt-3">Hola, {{ name() }} 😎</h1>
    <p class="muted mt-3">Pequeños momentos, grandes historias. Así está creciendo Memento.</p>
    @if (error()) {
      <p role="alert" class="mt-6">{{ error() }}</p>
    }
    <div class="room-grid mt-8">
      <a routerLink="/admin/users" class="panel"
        ><app-icon name="users" />
        <p class="page-title mt-5">{{ loading() ? '—' : totals().users }}</p>
        <p class="muted">Usuarios registrados</p></a
      >
      <div class="panel">
        <app-icon name="home" />
        <p class="page-title mt-5">{{ loading() ? '—' : (roomCount() ?? totals().rooms) }}</p>
        <p class="muted">Salas de recuerdos</p>
      </div>
      <div class="panel">
        <app-icon name="photo" />
        <p class="page-title mt-5">{{ loading() ? '—' : totals().photos }}</p>
        <p class="muted">Fotos compartidas</p>
      </div>
    </div> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  readonly roomCount = input<number>();
  private readonly client = inject(SupabaseService).client;
  readonly auth = inject(AuthStore);
  readonly totals = signal({ users: 0, rooms: 0, photos: 0 });
  readonly loading = signal(true);
  readonly error = signal('');
  name(): string {
    return (this.auth.profile()?.displayName || 'Admin').split(/\s+/)[0];
  }
  constructor() {
    void this.load();
    void this.client.functions
      .invoke('admin-users', { body: { action: 'flush-emails' } })
      .catch(() => undefined);
  }
  async load(): Promise<void> {
    try {
      const results = await Promise.all(
        ['profiles', 'rooms', 'photos'].map((table) =>
          this.client.from(table).select('id', { count: 'exact', head: true }),
        ),
      );
      if (results.some((result) => result.error)) throw new Error();
      this.totals.set({
        users: results[0].count ?? 0,
        rooms: results[1].count ?? 0,
        photos: results[2].count ?? 0,
      });
    } catch {
      this.error.set('No pudimos consultar las estadísticas.');
    } finally {
      this.loading.set(false);
    }
  }
}
