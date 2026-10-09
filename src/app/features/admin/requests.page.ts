import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LiveUpdatesService } from '../../core/services/live-updates.service';
import { FormsModule } from '@angular/forms';
import { Modal } from '../../core/ui/modal';
import { ToastService } from '../../core/ui/toasts';
import { AdminLayout } from './admin-layout';
import { AccessService } from '../access/access.service';
import {
  ManagedUser,
  requestLabels,
  requestStatusLabels,
  UserRequest,
} from '../access/access.models';
import { RoomSummary, RoomsService } from './rooms.service';

@Component({
  imports: [AdminLayout, DatePipe, FormsModule, Modal],
  templateUrl: './requests.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsPage {
  private readonly toast = inject(ToastService);
  private readonly access = inject(AccessService);
  private readonly roomService = inject(RoomsService);
  readonly requests = signal<UserRequest[]>([]);
  readonly users = signal<ManagedUser[]>([]);
  readonly rooms = signal<RoomSummary[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly filter = signal<'pending' | 'history'>('pending');
  readonly deleting = signal<UserRequest | null>(null);
  readonly labels = requestLabels;
  readonly statuses = requestStatusLabels;
  readonly pending = computed(() =>
    this.requests().filter((request) => ['pending', 'processing'].includes(request.status)),
  );
  readonly visible = computed(() =>
    this.filter() === 'pending'
      ? this.pending()
      : this.requests().filter((request) => ['approved', 'rejected'].includes(request.status)),
  );

  constructor() {
    void this.load();
    const live = inject(LiveUpdatesService);
    effect(() => {
      if (live.revision())
        untracked(() => {
          if (!this.busy()) void this.load();
        });
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [requests, users, rooms] = await Promise.all([
        this.access.requests(),
        this.access.users(),
        this.roomService.list(),
      ]);
      this.requests.set(requests);
      this.users.set(users);
      this.rooms.set(rooms);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cargar las solicitudes.');
    } finally {
      this.loading.set(false);
    }
  }

  userName(request: UserRequest): string {
    const user = this.users().find((user) => user.id === request.user_id);
    return user?.display_name || user?.email || 'Cuenta eliminada';
  }

  userEmail(request: UserRequest): string {
    return this.users().find((user) => user.id === request.user_id)?.email ?? '';
  }
  roomName(request: UserRequest): string {
    return this.rooms().find((room) => room.id === request.room_id)?.name ?? 'Sala eliminada';
  }

  async decide(request: UserRequest, approve: boolean): Promise<void> {
    if (this.busy()) return;
    if (approve && request.kind === 'delete_account' && this.deleting()?.id !== request.id) {
      this.deleting.set(request);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.access.decide(request.id, approve);
      this.deleting.set(null);
      this.notice.set(approve ? 'Solicitud aprobada.' : 'Solicitud denegada.');
      this.toast.show(this.notice());
      await this.load();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos resolver la solicitud.');
      this.toast.show(this.error(), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
