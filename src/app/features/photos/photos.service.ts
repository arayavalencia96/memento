import { inject, Injectable } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/services/supabase.service';
import { ApiResponse } from '../../core/models/app.models';
export interface PhotoMetadata {
  description: string;
  people: string[];
  location: string;
}
export interface AlbumPhoto extends PhotoMetadata {
  id: string;
  uploadedBy: string | null;
  uploadedAt: string;
  authorName: string;
  url: string;
  canEdit: boolean;
}
export interface AlbumRoom {
  id: string;
  name: string;
  description: string | null;
  photo_limit: number;
}
export interface AlbumResult {
  room: AlbumRoom;
  photos: AlbumPhoto[];
  hasMore: boolean;
  incomplete?: PendingUpload[];
}
export interface PendingUpload {
  id: string;
  uploadedAt: string;
}
@Injectable({ providedIn: 'root' })
export class PhotosService {
  async backupBytes(roomId: string, photoId: string): Promise<Uint8Array> {
    const { data, error } = await this.client.functions.invoke<Blob>('photos', {
      body: { action: 'backup-download', roomId, photoId },
    });
    if (error || !(data instanceof Blob))
      throw new Error('No pudimos descargar todas las fotos. No se generó una copia incompleta.');
    if (!data.size || data.size > 10485760) throw new Error('Una foto tiene un tamaño inválido.');
    return new Uint8Array(await data.arrayBuffer());
  }
  async cleanup(roomId: string, photoId: string): Promise<void> {
    await this.invoke({ action: 'cleanup', roomId, photoId });
  }
  private readonly client = inject(SupabaseService).client;
  list(roomId: string, page: number): Promise<AlbumResult> {
    return this.invoke({ action: 'list', roomId, page });
  }
  async upload(roomId: string, file: File, meta: PhotoMetadata): Promise<void> {
    const body = new FormData();
    body.set('action', 'upload');
    body.set('roomId', roomId);
    body.set('file', file);
    body.set('description', meta.description);
    body.set('location', meta.location);
    body.set('people', JSON.stringify(meta.people));
    await this.invoke(body);
  }
  async edit(roomId: string, photoId: string, meta: PhotoMetadata): Promise<void> {
    await this.invoke({ action: 'edit', roomId, photoId, ...meta });
  }
  async delete(roomId: string, photoId: string): Promise<void> {
    await this.invoke({ action: 'delete', roomId, photoId });
  }
  async url(roomId: string, photoId: string, download = false): Promise<string> {
    const result = await this.invoke<{ url: string }>({
      action: download ? 'download' : 'view',
      roomId,
      photoId,
    });
    return result.url;
  }
  private async invoke<T>(body: object | FormData): Promise<T> {
    const { data, error } = await this.client.functions.invoke<ApiResponse<T>>('photos', { body });
    if (error instanceof FunctionsHttpError) {
      const payload: unknown = await error.context
        .clone()
        .json()
        .catch(() => null);
      if (
        payload &&
        typeof payload === 'object' &&
        'message' in payload &&
        typeof payload.message === 'string'
      )
        throw new Error(payload.message);
    }
    if (error || !data?.ok)
      throw new Error('No pudimos completar la operación. Revisá tu conexión y la función photos.');
    return data.result;
  }
}
