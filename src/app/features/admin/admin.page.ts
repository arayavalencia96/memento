import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { RoomSummary, RoomsService } from './rooms.service';
import { AdminLayout } from './admin-layout';
import { Icon } from '../../core/ui/icon';
import { Modal } from '../../core/ui/modal';
import { ToastService } from '../../core/ui/toasts';
import { DashboardPage } from './dashboard.page';
import { BackupService } from '../photos/backup.service';
import { FormsModule } from '@angular/forms';

@Component({
  imports: [
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    DatePipe,
    AdminLayout,
    Icon,
    Modal,
    DashboardPage,
  ],
  templateUrl: './admin.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage {
  readonly backup = inject(BackupService);
  backupConfirmed = false;
  async exportBackup(room?: RoomSummary): Promise<void> {
    if (room?.id === this.deleting()?.id) this.backupConfirmed = false;
    try {
      await this.backup.exportRooms(room ? [room.id] : this.rooms().map((item) => item.id));
      this.toast.show(
        'Copia preparada. Verificá y guardá el ZIP antes de eliminar una sala.',
        'info',
      );
    } catch (error) {
      this.toast.show(
        error instanceof Error ? error.message : 'No pudimos exportar las fotos.',
        'error',
      );
    }
  }
  private readonly toast = inject(ToastService);
  readonly creating = signal(false);
  readonly auth = inject(AuthStore);
  private readonly service = inject(RoomsService);
  private readonly fb = inject(FormBuilder);
  readonly rooms = signal<RoomSummary[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly loadError = signal('');
  readonly editing = signal<RoomSummary | null>(null);
  readonly deleting = signal<RoomSummary | null>(null);
  readonly rotating = signal<RoomSummary | null>(null);
  readonly actionBusy = signal(false);
  readonly actionError = signal('');
  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/\S/)]],
    description: ['', Validators.maxLength(500)],
    photoLimit: [
      200,
      [Validators.required, Validators.min(1), Validators.max(10000), Validators.pattern(/^\d+$/)],
    ],
  });
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(/\S/)]],
    description: ['', Validators.maxLength(500)],
    photoLimit: [
      200,
      [Validators.required, Validators.min(1), Validators.max(10000), Validators.pattern(/^\d+$/)],
    ],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.rooms.set(await this.service.list());
    } catch (error) {
      this.loadError.set(error instanceof Error ? error.message : 'No pudimos cargar las salas.');
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const input = this.form.getRawValue();
      const result = await this.service.create({
        ...input,
        name: input.name.trim(),
        description: input.description.trim(),
      });
      this.rooms.update((rooms) => [
        { ...result.room, code: result.code, codeExpiresAt: result.room.codeExpiresAt },
        ...rooms,
      ]);
      this.form.reset({ name: '', description: '', photoLimit: 200 });
      this.creating.set(false);
      this.toast.show('Sala creada. El código dura 15 minutos.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos crear la sala.');
      this.toast.show(this.error(), 'error');
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(room: RoomSummary): void {
    this.actionError.set('');
    this.editing.set(room);
    this.deleting.set(null);
    this.editForm.reset({
      name: room.name,
      description: room.description ?? '',
      photoLimit: room.photo_limit,
    });
  }

  async saveEdit(): Promise<void> {
    const room = this.editing();
    this.editForm.markAllAsTouched();
    if (!room || this.editForm.invalid || this.actionBusy()) return;
    if (await this.runAction(room, 'update', this.editForm.getRawValue())) this.editing.set(null);
  }

  confirmDelete(room: RoomSummary): void {
    if (this.backup.busy() || this.actionBusy()) return;
    this.backupConfirmed = false;
    this.editing.set(null);
    this.actionError.set('');
    this.deleting.set(room);
  }

  async remove(): Promise<void> {
    if (!this.backupConfirmed || this.backup.busy()) return;
    const room = this.deleting();
    if (room && (await this.runAction(room, 'delete'))) this.deleting.set(null);
  }

  async rotate(room: RoomSummary): Promise<void> {
    if (await this.runAction(room, 'rotate-code')) this.rotating.set(null);
  }

  private async runAction(
    room: RoomSummary,
    action: 'update' | 'delete' | 'rotate-code',
    input?: { name: string; description: string; photoLimit: number },
  ): Promise<boolean> {
    if (this.actionBusy()) return false;
    this.actionBusy.set(true);
    this.actionError.set('');
    try {
      await this.service.manage(room.id, action, input);
      await this.load();
      this.toast.show(
        action === 'delete'
          ? 'Sala eliminada.'
          : action === 'rotate-code'
            ? 'Nuevo código generado. Vence en 15 minutos.'
            : 'Sala actualizada.',
      );
      return true;
    } catch (error) {
      this.actionError.set(
        error instanceof Error ? error.message : 'No pudimos realizar la operación.',
      );
      this.toast.show(this.actionError(), 'error');
      return false;
    } finally {
      this.actionBusy.set(false);
    }
  }

  codeExpired(room: RoomSummary): boolean {
    return !room.codeExpiresAt || Date.parse(room.codeExpiresAt) <= Date.now();
  }
}
