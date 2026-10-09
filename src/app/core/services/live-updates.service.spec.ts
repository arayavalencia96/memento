import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { LiveUpdatesService } from './live-updates.service';
import { AuthStore } from '../stores/auth.store';
import { SupabaseService } from './supabase.service';
import { ToastService } from '../ui/toasts';
import { AccessService } from '../../features/access/access.service';
interface Filter {
  event: string;
  table: string;
  filter?: string;
}
describe('LiveUpdatesService', () => {
  const profile = signal<{ id: string; role: string } | null>(null);
  let handlers: { filter: Filter; run: (payload: { new: Record<string, unknown> }) => void }[];
  const pendingCount = vi.fn();
  const show = vi.fn();
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  const client = { channel: vi.fn(), removeChannel: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    profile.set(null);
    handlers = [];
    show.mockReset();
    pendingCount.mockReset().mockResolvedValue(0);
    channel.on
      .mockReset()
      .mockImplementation(
        (
          _event: string,
          filter: Filter,
          run: (payload: { new: Record<string, unknown> }) => void,
        ) => {
          handlers.push({ filter, run });
          return channel;
        },
      );
    channel.subscribe.mockReset().mockReturnValue(channel);
    client.channel.mockReset().mockReturnValue(channel);
    client.removeChannel.mockReset().mockResolvedValue('ok');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { profile } },
        { provide: SupabaseService, useValue: { client } },
        { provide: ToastService, useValue: { show } },
        { provide: AccessService, useValue: { pendingCount } },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('does not open a channel before authentication', () => {
    TestBed.inject(LiveUpdatesService);
    TestBed.tick();
    expect(client.channel).not.toHaveBeenCalled();
  });
  it('coalesces admin events and updates the pending badge', () => {
    const live = TestBed.inject(LiveUpdatesService);
    profile.set({ id: 'admin-1', role: 'admin' });
    TestBed.tick();
    const event = handlers.find(
      (handler) => handler.filter.table === 'user_requests' && handler.filter.event === 'INSERT',
    );
    event?.run({ new: { status: 'pending' } });
    event?.run({ new: { status: 'pending' } });
    vi.advanceTimersByTime(200);
    expect(live.revision()).toBe(1);
    expect(pendingCount).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledWith('Tenés una nueva solicitud para revisar.', 'info');
  });
  it('filters member events by UID and closes subscriptions on logout', () => {
    TestBed.inject(LiveUpdatesService);
    profile.set({ id: 'member-1', role: 'member' });
    TestBed.tick();
    expect(handlers.every((handler) => handler.filter.filter === 'user_id=eq.member-1')).toBe(true);
    expect(handlers.some((handler) => handler.filter.event === 'DELETE')).toBe(false);
    profile.set(null);
    TestBed.tick();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
