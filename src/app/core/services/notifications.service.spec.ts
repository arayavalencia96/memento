import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { NotificationsService, RequestNotification } from './notifications.service';
import { AuthStore } from '../stores/auth.store';
import { SupabaseService } from './supabase.service';
import { LiveUpdatesService } from './live-updates.service';
import { ToastService } from '../ui/toasts';

describe('NotificationsService', () => {
  const profile = signal<{ id: string; role: string } | null>(null);
  const revision = signal(0);
  const rpc = vi.fn();
  const limit = vi.fn();
  const receipt = vi.fn();
  const show = vi.fn();
  const item: RequestNotification = {
    id: 'request-1',
    user_id: 'member-1',
    room_id: 'room-1',
    kind: 'join',
    status: 'pending',
    created_at: '2026-10-09T10:00:00Z',
    activity_at: '2026-10-09T10:00:00Z',
    decided_at: null,
  };
  beforeEach(() => {
    profile.set(null);
    revision.set(0);
    limit.mockReset().mockResolvedValue({ data: [item], error: null });
    receipt.mockReset().mockResolvedValue({ data: null, error: null });
    rpc.mockReset().mockResolvedValue({ data: item.activity_at, error: null });
    show.mockReset();
    const requests = { select: () => requests, eq: () => requests, order: () => requests, limit };
    const reads = { select: () => reads, eq: () => reads, maybeSingle: receipt };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { profile } },
        { provide: LiveUpdatesService, useValue: { revision } },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: (table: string) => (table === 'user_requests' ? requests : reads),
              rpc,
            },
          },
        },
        { provide: ToastService, useValue: { show } },
      ],
    });
  });
  async function ready(): Promise<NotificationsService> {
    const service = TestBed.inject(NotificationsService);
    profile.set({ id: 'member-1', role: 'member' });
    TestBed.tick();
    await service.refresh();
    return service;
  }
  it('loads only five latest movements and persists reading when opened', async () => {
    const service = await ready();
    expect(limit).toHaveBeenCalledWith(5);
    expect(service.unread()).toBe(1);
    await service.markRead();
    expect(rpc).toHaveBeenCalledWith('mark_notifications_read', { cutoff: item.activity_at });
    expect(service.unread()).toBe(0);
  });
  it('treats a new decision as unread without marking it before opening', async () => {
    const service = await ready();
    await service.markRead();
    limit.mockResolvedValue({
      data: [{ ...item, status: 'approved', activity_at: '2026-10-09T11:00:00Z' }],
      error: null,
    });
    await service.refresh();
    expect(service.unread()).toBe(1);
    expect(rpc).toHaveBeenCalledOnce();
  });
  it('clears personal notifications on logout', async () => {
    const service = await ready();
    profile.set(null);
    TestBed.tick();
    expect(service.items()).toEqual([]);
    expect(service.unread()).toBe(0);
  });
  it('keeps unread state if saving the receipt fails', async () => {
    const service = await ready();
    rpc.mockResolvedValue({ data: null, error: { message: 'failure' } });
    await service.markRead();
    expect(service.unread()).toBe(1);
    expect(show).toHaveBeenCalledWith('No pudimos marcar las notificaciones como leídas.', 'error');
  });
});
