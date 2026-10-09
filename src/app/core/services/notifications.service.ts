import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthStore } from '../stores/auth.store';
import { SupabaseService } from './supabase.service';
import { LiveUpdatesService } from './live-updates.service';
import { UserRequest } from '../../features/access/access.models';
import { ToastService } from '../ui/toasts';

export interface RequestNotification extends UserRequest {
  activity_at: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly auth = inject(AuthStore);
  private readonly client = inject(SupabaseService).client;
  private readonly live = inject(LiveUpdatesService);
  private readonly toast = inject(ToastService);
  readonly items = signal<RequestNotification[]>([]);
  readonly seenAt = signal('');
  readonly error = signal('');
  readonly unread = computed(
    () =>
      this.items().filter(
        (item) => !this.seenAt() || Date.parse(item.activity_at) > Date.parse(this.seenAt()),
      ).length,
  );
  private generation = 0;
  private owner = '';

  constructor() {
    effect(() => {
      const profile = this.auth.profile();
      this.live.revision();
      untracked(() => {
        const generation = ++this.generation;
        if (this.owner !== (profile?.id ?? '')) {
          this.owner = profile?.id ?? '';
          this.items.set([]);
          this.seenAt.set('');
          this.error.set('');
        }
        if (!profile || profile.role !== 'member') {
          this.items.set([]);
          this.seenAt.set('');
          this.error.set('');
          return;
        }
        void this.load(profile.id, generation);
      });
    });
  }

  async refresh(): Promise<void> {
    const profile = this.auth.profile();
    if (profile?.role === 'member') await this.load(profile.id, ++this.generation);
  }

  private async load(userId: string, generation: number): Promise<void> {
    try {
      const [requests, receipt] = await Promise.all([
        this.client
          .from('user_requests')
          .select('id,user_id,room_id,kind,status,created_at,decided_at,activity_at')
          .eq('user_id', userId)
          .order('activity_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(5),
        this.client
          .from('notification_reads')
          .select('seen_at')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);
      if (generation !== this.generation) return;
      if (requests.error || receipt.error) throw new Error();
      this.items.set(requests.data ?? []);
      const saved = receipt.data?.seen_at ?? '';
      if (!this.seenAt() || Date.parse(saved) > Date.parse(this.seenAt())) this.seenAt.set(saved);
      this.error.set('');
    } catch {
      if (generation === this.generation) this.error.set('No pudimos cargar las notificaciones.');
    }
  }

  async markRead(): Promise<void> {
    const latest = this.items()[0];
    const userId = this.auth.profile()?.id;
    if (!latest || !userId || !this.unread()) return;
    try {
      const { data, error } = await this.client.rpc('mark_notifications_read', {
        cutoff: latest.activity_at,
      });
      if (error || typeof data !== 'string') throw new Error();
      if (this.auth.profile()?.id === userId) this.seenAt.set(data);
    } catch {
      this.toast.show('No pudimos marcar las notificaciones como leídas.', 'error');
    }
  }
}
