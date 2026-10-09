import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Header } from '../../core/ui/header';
import { Icon } from '../../core/ui/icon';
import { Modal } from '../../core/ui/modal';
import { ToastService } from '../../core/ui/toasts';
import { AuthStore } from '../../core/stores/auth.store';
import { BackupService } from './backup.service';
import {
  AlbumPhoto,
  AlbumRoom,
  PhotoMetadata,
  PhotosService,
  PendingUpload,
} from './photos.service';
@Component({
  imports: [Header, Icon, Modal, FormsModule, RouterLink, DatePipe],
  templateUrl: './album.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumPage {
  readonly backup = inject(BackupService);
  async exportBackup(): Promise<void> {
    try {
      await this.backup.exportRooms([this.roomId]);
      this.toast.show('Copia preparada. Verificá que el ZIP se guardó correctamente.', 'info');
    } catch (error) {
      this.toast.show(
        error instanceof Error ? error.message : 'No pudimos exportar las fotos.',
        'error',
      );
    }
  }
  readonly auth = inject(AuthStore);
  private readonly service = inject(PhotosService);
  private readonly toast = inject(ToastService);
  readonly roomId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  readonly room = signal<AlbumRoom | null>(null);
  readonly photos = signal<AlbumPhoto[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly hasMore = signal(false);
  readonly selected = signal<AlbumPhoto | null>(null);
  readonly info = signal(false);
  readonly editing = signal<AlbumPhoto | null>(null);
  readonly deleting = signal<AlbumPhoto | null>(null);
  readonly uploading = signal(false);
  readonly incomplete = signal<PendingUpload[]>([]);
  readonly cleanupTarget = signal<PendingUpload | null>(null);
  private page = 0;
  file: File | null = null;
  description = '';
  people = '';
  location = '';
  private readonly renewed = new Set<string>();
  constructor() {
    void this.load();
  }
  async load(more = false): Promise<void> {
    if (more && this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const next = more ? this.page + 1 : 0;
      const result = await this.service.list(this.roomId, next);
      this.page = next;
      this.room.set(result.room);
      this.incomplete.set(result.incomplete ?? []);
      this.photos.update((photos) =>
        more
          ? [
              ...photos,
              ...result.photos.filter((photo) => !photos.some((item) => item.id === photo.id)),
            ]
          : result.photos,
      );
      this.hasMore.set(result.hasMore);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos cargar el álbum.');
      this.toast.show(this.error(), 'error');
    } finally {
      this.loading.set(false);
    }
  }
  newPhoto(): void {
    this.file = null;
    this.description = '';
    this.people = '';
    this.location = '';
    this.uploading.set(true);
  }
  async renew(photo: AlbumPhoto): Promise<void> {
    if (this.renewed.has(photo.id)) return;
    this.renewed.add(photo.id);
    try {
      const url = await this.service.url(this.roomId, photo.id);
      this.photos.update((photos) =>
        photos.map((item) => (item.id === photo.id ? { ...item, url } : item)),
      );
    } catch {
      this.error.set('No pudimos acceder a algunas imágenes. Volvé a entrar al álbum.');
    }
  }
  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (
      file &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10485760)
    ) {
      this.toast.show('Elegí una foto JPG, PNG o WebP de hasta 10 MB.', 'error');
      input.value = '';
      this.file = null;
      return;
    }
    this.file = file;
  }
  editPhoto(photo: AlbumPhoto): void {
    this.selected.set(null);
    this.description = photo.description;
    this.people = photo.people.join(', ');
    this.location = photo.location;
    this.editing.set(photo);
  }
  deletePhoto(photo: AlbumPhoto): void {
    this.selected.set(null);
    this.deleting.set(photo);
  }
  async view(photo: AlbumPhoto): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const url = await this.service.url(this.roomId, photo.id);
      this.info.set(false);
      this.selected.set({ ...photo, url });
    } catch (error) {
      this.failure(error);
    } finally {
      this.busy.set(false);
    }
  }
  async download(photo: AlbumPhoto): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const url = await this.service.url(this.roomId, photo.id, true);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.rel = 'noopener';
      anchor.download = `memento-${photo.id}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      this.toast.show('Descarga iniciada.', 'info');
    } catch (error) {
      this.failure(error);
    } finally {
      this.busy.set(false);
    }
  }
  async save(): Promise<void> {
    if (this.busy()) return;
    const meta: PhotoMetadata = {
      description: this.description.trim(),
      people: this.people
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
      location: this.location.trim(),
    };
    if (
      meta.people.length > 20 ||
      meta.people.some((name) => name.length > 80) ||
      meta.people.join(',').length > 1000 ||
      meta.description.length > 1000 ||
      meta.location.length > 120
    ) {
      this.toast.show('Revisá los datos: hasta 20 nombres de 80 caracteres.', 'error');
      return;
    }
    const editing = this.editing();
    if (!editing && !this.file) {
      this.toast.show('Elegí una foto.', 'error');
      return;
    }
    this.busy.set(true);
    try {
      if (editing) await this.service.edit(this.roomId, editing.id, meta);
      else if (this.file) await this.service.upload(this.roomId, this.file, meta);
      this.uploading.set(false);
      this.editing.set(null);
      this.toast.show(editing ? 'Foto actualizada.' : 'Un nuevo recuerdo guardado 😎');
      await this.load();
    } catch (error) {
      this.failure(error);
    } finally {
      this.busy.set(false);
    }
  }
  async remove(): Promise<void> {
    const photo = this.deleting();
    if (!photo || this.busy()) return;
    this.busy.set(true);
    try {
      await this.service.delete(this.roomId, photo.id);
      this.deleting.set(null);
      this.toast.show('Foto eliminada.');
      await this.load();
    } catch (error) {
      this.failure(error);
    } finally {
      this.busy.set(false);
    }
  }
  private failure(error: unknown): void {
    this.toast.show(
      error instanceof Error ? error.message : 'No pudimos completar la acción.',
      'error',
    );
  }
  async cleanup(): Promise<void> {
    const target = this.cleanupTarget();
    if (!target || this.busy()) return;
    this.busy.set(true);
    try {
      await this.service.cleanup(this.roomId, target.id);
      this.cleanupTarget.set(null);
      this.toast.show('Carga incompleta eliminada. Espacio liberado.');
      await this.load();
    } catch (error) {
      this.failure(error);
    } finally {
      this.busy.set(false);
    }
  }
}
