import { inject, Injectable, signal } from '@angular/core';
import { AlbumPhoto, AlbumRoom, PhotosService } from './photos.service';

interface BackupRoom {
  room: AlbumRoom;
  photos: AlbumPhoto[];
}

export function backupFolder(name: string, id: string): string {
  const safe = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${safe || 'sala'}-${id}`;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly photos = inject(PhotosService);
  readonly busy = signal(false);
  readonly progress = signal('');

  async exportRooms(roomIds: readonly string[]): Promise<void> {
    if (this.busy()) throw new Error('Ya hay una copia de seguridad en curso.');
    if (!roomIds.length) throw new Error('No hay salas para exportar.');
    this.busy.set(true);
    this.progress.set('Preparando copia…');
    try {
      const snapshots: BackupRoom[] = [];
      for (const roomId of [...new Set(roomIds)]) {
        const first = await this.photos.list(roomId, 0);
        const entries = new Map(first.photos.map((photo) => [photo.id, photo]));
        let page = 0;
        let hasMore = first.hasMore;
        while (hasMore) {
          const next = await this.photos.list(roomId, ++page);
          for (const photo of next.photos) entries.set(photo.id, photo);
          hasMore = next.hasMore;
          if (page > 250)
            throw new Error('El álbum cambió durante la exportación. Reintentá la copia.');
        }
        snapshots.push({ room: first.room, photos: [...entries.values()] });
      }
      const { Zip, ZipPassThrough, strToU8 } = await import('fflate');
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      let zipFailure: Error | undefined;
      const zip = new Zip((error, data) => {
        if (error) {
          zipFailure = error;
          return;
        }
        bytes += data.length;
        if (bytes > 250 * 1024 * 1024) {
          zipFailure = new Error(
            'La copia supera 250 MB. Exportá las salas por separado antes de eliminar.',
          );
          return;
        }
        chunks.push(new Uint8Array(data));
      });
      const add = (path: string, data: Uint8Array): void => {
        const entry = new ZipPassThrough(path);
        zip.add(entry);
        entry.push(data, true);
        if (zipFailure) throw zipFailure;
      };
      const total = snapshots.reduce((count, snapshot) => count + snapshot.photos.length, 0);
      let completed = 0;
      for (const snapshot of snapshots) {
        const folder = backupFolder(snapshot.room.name, snapshot.room.id);
        const metadata: { file: string; photo: Omit<AlbumPhoto, 'url' | 'canEdit'> }[] = [];
        for (const photo of snapshot.photos) {
          this.progress.set(`Descargando foto ${completed + 1} de ${total}…`);
          const content = await this.photos.backupBytes(snapshot.room.id, photo.id);
          const extension =
            content[0] === 255 && content[1] === 216 && content[2] === 255
              ? 'jpg'
              : [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => content[index] === byte)
                ? 'png'
                : new TextDecoder().decode(content.slice(0, 4)) === 'RIFF' &&
                    new TextDecoder().decode(content.slice(8, 12)) === 'WEBP'
                  ? 'webp'
                  : '';
          if (!extension)
            throw new Error('Una descarga no devolvió una imagen válida. No se generó la copia.');
          if (!content.length || content.length > 10485760)
            throw new Error('Una foto tiene un tamaño inválido.');
          const file = `fotos/${photo.id}.${extension}`;
          add(`${folder}/${file}`, content);
          const { url: _url, canEdit: _canEdit, ...details } = photo;
          metadata.push({ file, photo: details });
          completed++;
        }
        add(
          `${folder}/datos.json`,
          strToU8(
            JSON.stringify(
              {
                exportedAt: new Date().toISOString(),
                room: snapshot.room,
                photos: metadata,
              },
              null,
              2,
            ),
          ),
        );
      }
      zip.end();
      if (zipFailure) throw zipFailure;
      const archive = new Blob(chunks, { type: 'application/zip' });
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `MEMENTO-${snapshots.length === 1 ? backupFolder(snapshots[0].room.name, snapshots[0].room.id) : 'todas-las-salas'}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.progress.set('ZIP preparado. Comprobá que la descarga se guardó correctamente.');
    } finally {
      this.busy.set(false);
    }
  }
}
