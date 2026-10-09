import { inject, Injectable, signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/services/supabase.service';
import { ApiResponse } from '../../core/models/app.models';
import { ManagedUser, Membership, UserRequest } from './access.models';
import { ToastService } from '../../core/ui/toasts';

@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly toast = inject(ToastService);
  private readonly client = inject(SupabaseService).client;
  readonly pendingRequestsCount = signal(0);

  async users(): Promise<ManagedUser[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id, email, display_name, avatar_url, role, enabled, created_at')
      .order('created_at', { ascending: false });
    if (error)
      throw new Error('No pudimos cargar los usuarios. Aplicá la migración de solicitudes.');
    return data ?? [];
  }

  async memberships(): Promise<Membership[]> {
    const { data, error } = await this.client
      .from('room_members')
      .select('room_id, user_id, status');
    if (error) throw new Error('No pudimos cargar las membresías.');
    return data ?? [];
  }

  async requests(): Promise<UserRequest[]> {
    const { data, error } = await this.client
      .from('user_requests')
      .select('id, user_id, room_id, kind, status, created_at, decided_at')
      .order('created_at', { ascending: false });
    if (error)
      throw new Error('No pudimos cargar las solicitudes. Aplicá la migración de solicitudes.');
    this.pendingRequestsCount.set(
      (data ?? []).filter(
        (request) => request.status === 'pending' || request.status === 'processing',
      ).length,
    );
    return data ?? [];
  }

  async pendingCount(): Promise<number> {
    const { count, error } = await this.client
      .from('user_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']);
    if (error) throw new Error('No se pudo consultar el contador.');
    this.pendingRequestsCount.set(count ?? 0);
    return count ?? 0;
  }

  decide(requestId: string, approve: boolean): Promise<void> {
    return this.invoke('admin-users', { action: 'decide', requestId, approve });
  }

  setEnabled(userId: string, enabled: boolean): Promise<void> {
    return this.invoke('admin-users', { action: 'set-enabled', userId, enabled });
  }

  setMembership(userId: string, roomId: string, status: 'active' | 'revoked'): Promise<void> {
    return this.invoke('admin-users', { action: 'set-membership', userId, roomId, status });
  }

  requestLeave(roomId: string): Promise<void> {
    return this.invoke('member-request', { kind: 'leave', roomId });
  }

  requestDeletion(): Promise<void> {
    return this.invoke('member-request', { kind: 'delete_account' });
  }

  requestJoin(code: string): Promise<void> {
    return this.invoke('request-room-access', { code });
  }

  private async invoke(functionName: string, body: object): Promise<void> {
    const { data, error } = await this.client.functions.invoke<ApiResponse<object>>(functionName, {
      body,
    });
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
    if (error)
      throw new Error(
        'No pudimos enviar la operación. Revisá la conexión y el despliegue de las funciones.',
      );
    if (!data?.ok) throw new Error('La operación no pudo completarse.');
    if ('emailPending' in data.result && data.result.emailPending === true)
      this.toast.show('El acceso ya está aprobado. El correo quedó pendiente de envío.', 'info');
  }
}
