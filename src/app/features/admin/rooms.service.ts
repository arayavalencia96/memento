import { inject, Injectable } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/services/supabase.service';

export interface RoomSummary {
  id: string;
  name: string;
  description: string | null;
  photo_limit: number;
  created_at: string;
  code?: string;
  codeExpiresAt?: string;
  deleting?: boolean;
}

export interface CreateRoomInput {
  name: string;
  description: string;
  photoLimit: number;
}

export interface CreatedRoom {
  room: RoomSummary;
  code: string;
}

@Injectable({ providedIn: 'root' })
export class RoomsService {
  private readonly client = inject(SupabaseService).client;

  async list(): Promise<RoomSummary[]> {
    const { data, error } = await this.client
      .from('rooms')
      .select('id, name, description, photo_limit, created_at, deleting')
      .order('created_at', { ascending: false });
    if (error)
      throw new Error(
        'No pudimos cargar las salas. Revisá la conexión y los permisos de Supabase.',
      );
    const { data: codes, error: codeError } = await this.client
      .from('room_codes')
      .select('room_id, code, expires_at');
    if (codeError)
      throw new Error('Aplicá la nueva migración para consultar los códigos de las salas.');
    return (data ?? []).map((room) => {
      const entry = codes?.find((entry) => entry.room_id === room.id);
      return { ...room, code: entry?.code, codeExpiresAt: entry?.expires_at };
    });
  }

  async manage(
    roomId: string,
    action: 'update' | 'delete' | 'rotate-code',
    input?: CreateRoomInput,
  ): Promise<void> {
    for (let batch = 0; batch < 2001; batch++) {
      const { data, error } = await this.client.functions.invoke<{
        ok: boolean;
        result?: { complete: boolean; remaining: number };
      }>('manage-room', {
        body: {
          roomId,
          action,
          ...input,
          ...(action === 'delete' ? { backupConfirmed: true } : {}),
        },
      });
      if (error instanceof FunctionsHttpError) {
        const response: unknown = await error.context
          .clone()
          .json()
          .catch(() => null);
        if (
          response &&
          typeof response === 'object' &&
          'message' in response &&
          typeof response.message === 'string'
        )
          throw new Error(response.message);
      }
      if (error)
        throw new Error('No pudimos realizar la operación. Revisá la función manage-room.');
      if (!data?.ok) throw new Error('No pudimos completar la operación.');
      if (action !== 'delete' || data.result?.complete === true) return;
      if (!data.result || typeof data.result.complete !== 'boolean')
        throw new Error('La respuesta de eliminación está incompleta.');
    }
    throw new Error('La limpieza no terminó. Reintentá eliminar la sala para continuar.');
  }

  async create(input: CreateRoomInput): Promise<CreatedRoom> {
    const { data, error } = await this.client.functions.invoke<{
      ok: boolean;
      result?: CreatedRoom;
    }>('create-room', {
      body: input,
    });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const status = error.context.status;
        const response: unknown = await error.context
          .clone()
          .json()
          .catch(() => null);
        if (
          response &&
          typeof response === 'object' &&
          'code' in response &&
          response.code === 'PROFILE_LOOKUP_FAILED'
        ) {
          throw new Error(
            'Supabase no pudo consultar tu rol. Aplicá la migración de permisos service_role y revisá los logs de create-room.',
          );
        }
        if (status === 401)
          throw new Error('Tu sesión no es válida. Cerrá sesión y volvé a ingresar.');
        if (status === 403) throw new Error('Tu cuenta no tiene permisos para crear salas.');
        if (status === 404)
          throw new Error('La función create-room todavía no está desplegada en Supabase.');
        if (status === 500)
          throw new Error(
            'Revisá la configuración de la función y el secreto ROOM_CODE_PEPPER en Supabase.',
          );
      }
      throw new Error(
        'No pudimos crear la sala. Revisá la conexión y los logs de create-room en Supabase.',
      );
    }
    if (!data?.ok || !data.result) throw new Error('Supabase devolvió una respuesta incompleta.');
    return data.result;
  }
}
