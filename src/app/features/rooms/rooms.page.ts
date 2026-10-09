import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LiveUpdatesService } from '../../core/services/live-updates.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { SupabaseService } from '../../core/services/supabase.service';
import { AccessService } from '../access/access.service';
import { UserRequest } from '../access/access.models';
import { RoomSummary } from '../admin/rooms.service';
import { Header } from '../../core/ui/header';
import { Icon } from '../../core/ui/icon';
import { Modal } from '../../core/ui/modal';
import { ToastService } from '../../core/ui/toasts';
import { Router } from '@angular/router';

@Component({
  imports: [FormsModule, RouterLink, Header, Icon, Modal],
  templateUrl: './rooms.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsPage {
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationsService);
  firstName(): string {
    return (this.auth.profile()?.displayName || 'Invitado').trim().split(/\s+/)[0];
  }
  readonly auth = inject(AuthStore);
  private readonly supabase = inject(SupabaseService);
  readonly access = inject(AccessService);
  readonly requesting = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal('');
  readonly loading = signal(true);
  readonly rooms = signal<RoomSummary[]>([]);
  readonly requests = signal<UserRequest[]>([]);
  readonly leaveRoom = signal<RoomSummary | null>(null);
  roomCode = '';

  constructor() {
    if (this.auth.isAdmin()) void this.router.navigateByUrl('/admin');
    else void this.load();
    const live = inject(LiveUpdatesService);
    effect(() => {
      if (live.revision())
        untracked(() => {
          if (!this.auth.isAdmin() && !this.requesting()) void this.load();
        });
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [{ data, error }, requests] = await Promise.all([
        this.supabase.client
          .from('rooms')
          .select('id, name, description, photo_limit, created_at')
          .order('created_at', { ascending: false }),
        this.access.requests(),
      ]);
      if (error) throw new Error('No pudimos cargar tus salas.');
      this.rooms.set(data ?? []);
      this.requests.set(requests);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cargar tus datos.');
    } finally {
      this.loading.set(false);
    }
  }

  pendingLeave(roomId: string): boolean {
    return this.requests().some(
      (request) =>
        request.room_id === roomId && request.kind === 'leave' && request.status === 'pending',
    );
  }

  async requestAccess(): Promise<void> {
    if (!/^\d{6}$/.test(this.roomCode)) {
      this.message.set('Ingresá un código de seis dígitos.');
      this.toast.show('Ingresá un código de seis dígitos.', 'error');
      return;
    }
    await this.send(async () => {
      await this.access.requestJoin(this.roomCode);
      this.roomCode = '';
      await this.notifications.refresh();
    }, 'Solicitud enviada. Si el código es válido, el administrador recibirá tu pedido.');
  }

  async requestLeave(): Promise<void> {
    const room = this.leaveRoom();
    if (!room) return;
    await this.send(
      () => this.access.requestLeave(room.id),
      'Pedido de salida enviado. Conservás el acceso hasta que el administrador lo apruebe.',
    );
    this.leaveRoom.set(null);
  }

  private async send(operation: () => Promise<void>, notice: string): Promise<void> {
    if (this.requesting()) return;
    this.requesting.set(true);
    this.message.set(null);
    this.error.set('');
    try {
      await operation();
      this.message.set(notice);
      this.toast.show(notice, 'info');
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos enviar la solicitud.');
      this.toast.show(this.error(), 'error');
    } finally {
      this.requesting.set(false);
    }
  }
}
