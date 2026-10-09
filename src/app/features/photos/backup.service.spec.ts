import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { BackupService, backupFolder } from './backup.service';
import { PhotosService, AlbumPhoto } from './photos.service';
import { unzipSync, strFromU8 } from 'fflate';

describe('BackupService', () => {
  const list = vi.fn();
  const backupBytes = vi.fn();
  const createObjectURL = vi.fn();
  let archive: Blob;
  const photo: AlbumPhoto = {
    id: 'photo-1',
    description: 'Un recuerdo',
    people: ['Ana'],
    location: 'Casa',
    uploadedAt: '2026-10-09T10:00:00Z',
    uploadedBy: 'user-1',
    authorName: 'Ana',
    url: 'https://private.example/signed-secret',
    canEdit: true,
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'Blob',
      class {
        private readonly bytes: Uint8Array<ArrayBuffer>;
        constructor(parts: Uint8Array[]) {
          this.bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
          let offset = 0;
          for (const part of parts) {
            this.bytes.set(part, offset);
            offset += part.length;
          }
        }
        async arrayBuffer(): Promise<ArrayBuffer> {
          return this.bytes.buffer;
        }
      },
    );
    createObjectURL.mockReset().mockImplementation((blob: Blob) => {
      archive = blob;
      return 'blob:backup';
    });
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = createObjectURL;
        static override revokeObjectURL = vi.fn();
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    list.mockReset().mockResolvedValue({
      room: { id: 'room-1', name: 'Familia', description: '', photo_limit: 200 },
      photos: [photo],
      hasMore: false,
    });
    backupBytes.mockReset().mockResolvedValue(new Uint8Array([255, 216, 255, 1, 2, 3]));
    TestBed.configureTestingModule({
      providers: [{ provide: PhotosService, useValue: { list, backupBytes } }],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('exports originals and metadata without temporary signed URLs', async () => {
    const service = TestBed.inject(BackupService);
    await service.exportRooms(['room-1']);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    expect([...files['Familia-room-1/fotos/photo-1.jpg']]).toEqual([255, 216, 255, 1, 2, 3]);
    const metadata = strFromU8(files['Familia-room-1/datos.json']);
    expect(metadata).toContain('Un recuerdo');
    expect(metadata).toContain('Ana');
    expect(metadata).not.toContain('signed-secret');
    expect(service.busy()).toBe(false);
  });
  it('does not download a partial archive when one image fails', async () => {
    backupBytes.mockRejectedValue(new Error('Falló la descarga'));
    const service = TestBed.inject(BackupService);
    await expect(service.exportRooms(['room-1'])).rejects.toThrow('Falló la descarga');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(service.busy()).toBe(false);
  });
  it('includes subsequent album pages', async () => {
    list
      .mockResolvedValueOnce({
        room: { id: 'room-1', name: 'Familia' },
        photos: [photo],
        hasMore: true,
      })
      .mockResolvedValueOnce({
        room: { id: 'room-1', name: 'Familia' },
        photos: [{ ...photo, id: 'photo-2' }],
        hasMore: false,
      });
    await TestBed.inject(BackupService).exportRooms(['room-1']);
    expect(list).toHaveBeenCalledWith('room-1', 1);
    expect(backupBytes).toHaveBeenCalledTimes(2);
  });
  it('uses filesystem-safe folder names', () => {
    expect(backupFolder('../Álbum / Familia', 'room-1')).toBe('Album-Familia-room-1');
  });
});
