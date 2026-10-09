import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../stores/auth.store';
import { SupabaseService } from './supabase.service';
import { ToastService } from '../ui/toasts';
import { AccessService } from '../../features/access/access.service';

@Injectable({ providedIn: 'root' })
export class LiveUpdatesService {
  private readonly auth = inject(AuthStore);
  private readonly client = inject(SupabaseService).client;
  private readonly toast = inject(ToastService);
  private readonly access = inject(AccessService);
  readonly revision = signal(0);
  readonly connected = signal(false);
  private readonly identity = computed(() => {
    const profile = this.auth.profile();
    return profile?.id ? `${profile.id}:${profile.role}` : '';
  });

  constructor() {
    effect((onCleanup) => {
      const identity = this.identity();
      if (!identity) {
        this.connected.set(false);
        return;
      }
      const [userId, role] = identity.split(':');
      const admin = role === 'admin';
      let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const invalidate = (): void => {
        if (!active) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!active) return;
          this.revision.update((value) => value + 1);
          if (admin) void this.access.pendingCount().catch(() => undefined);
        }, 200);
      };
      const channel = this.client.channel(`memento-access:${identity}`);
      if (!admin)
        for (const event of ['INSERT', 'UPDATE'] as const)
          channel.on(
            'postgres_changes',
            {
              event,
              schema: 'public',
              table: 'notification_reads',
              filter: `user_id=eq.${userId}`,
            },
            invalidate,
          );
      for (const table of ['user_requests', 'room_members'] as const) {
        for (const event of ['INSERT', 'UPDATE'] as const) {
          channel.on(
            'postgres_changes',
            {
              event,
              schema: 'public',
              table,
              ...(admin ? {} : { filter: `user_id=eq.${userId}` }),
            },
            (payload) => {
              if (!active) return;
              invalidate();
              if (admin && table === 'user_requests' && event === 'INSERT')
                this.toast.show('Tenés una nueva solicitud para revisar.', 'info');
              if (
                !admin &&
                table === 'room_members' &&
                'status' in payload.new &&
                payload.new['status'] === 'active'
              )
                this.toast.show('Ya tenés acceso a una nueva sala.', 'info');
            },
          );
        }
      }
      if (admin)
        for (const event of ['INSERT', 'UPDATE'] as const)
          channel.on(
            'postgres_changes',
            { event, schema: 'public', table: 'profiles' },
            invalidate,
          );
      channel.subscribe((status) => {
        if (!active) return;
        this.connected.set(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') invalidate();
      });
      const resume = (): void => {
        if (document.visibilityState === 'visible') invalidate();
      };
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('online', invalidate);
      onCleanup(() => {
        active = false;
        clearTimeout(timer);
        this.connected.set(false);
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('online', invalidate);
        void this.client.removeChannel(channel);
      });
    });
  }
}
