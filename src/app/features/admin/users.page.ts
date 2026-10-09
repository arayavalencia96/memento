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
import { Icon } from '../../core/ui/icon';
import { ToastService } from '../../core/ui/toasts';
import { RouterLink } from '@angular/router';
import { AdminLayout } from './admin-layout';
import { AccessService } from '../access/access.service';
import { ManagedUser, Membership, membershipLabels } from '../access/access.models';
import { RoomSummary, RoomsService } from './rooms.service';

@Component({
  imports: [AdminLayout, FormsModule, RouterLink, Modal, Icon],
  templateUrl: './users.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {
  private readonly toast = inject(ToastService);
  private readonly access = inject(AccessService);
  private readonly roomService = inject(RoomsService);
  readonly users = signal<ManagedUser[]>([]);
  readonly rooms = signal<RoomSummary[]>([]);
  readonly memberships = signal<Membership[]>([]);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly labels = membershipLabels;
  readonly confirmation = signal<{ label: string; run: () => Promise<void> } | null>(null);
  readonly selectedRooms: Record<string, string> = {};
  readonly visible = computed(() =>
    this.users().filter((user) =>
      `${user.display_name ?? ''} ${user.email}`
        .toLowerCase()
        .includes(this.search().toLowerCase()),
    ),
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
      const [users, rooms, memberships] = await Promise.all([
        this.access.users(),
        this.roomService.list(),
        this.access.memberships(),
      ]);
      this.users.set(users);
      this.rooms.set(rooms);
      this.memberships.set(memberships);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cargar los usuarios.');
    } finally {
      this.loading.set(false);
    }
  }

  userMemberships(userId: string): Membership[] {
    return this.memberships().filter((membership) => membership.user_id === userId);
  }
  roomName(roomId: string): string {
    return this.rooms().find((room) => room.id === roomId)?.name ?? 'Sala no disponible';
  }

  toggleUser(user: ManagedUser): void {
    this.confirmation.set({
      label: `${user.enabled ? 'Suspender' : 'Habilitar'} la cuenta de ${user.email}`,
      run: () => this.access.setEnabled(user.id, !user.enabled),
    });
  }

  changeAccess(userId: string, roomId: string, active: boolean): void {
    this.confirmation.set({
      label: `${active ? 'Conceder' : 'Revocar'} acceso a «${this.roomName(roomId)}»`,
      run: () => this.access.setMembership(userId, roomId, active ? 'active' : 'revoked'),
    });
  }

  async confirm(): Promise<void> {
    const action = this.confirmation();
    if (!action || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action.run();
      this.confirmation.set(null);
      this.notice.set('Permisos actualizados.');
      this.toast.show('Permisos actualizados.');
      await this.load();
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'No pudimos actualizar los permisos.',
      );
      this.toast.show(this.error(), 'error');
    } finally {
      this.busy.set(false);
    }
  }
}
