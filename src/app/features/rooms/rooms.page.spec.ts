import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { RoomsPage } from './rooms.page';
import { AuthStore } from '../../core/stores/auth.store';
import { SupabaseService } from '../../core/services/supabase.service';
import { LiveUpdatesService } from '../../core/services/live-updates.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { AccessService } from '../access/access.service';

describe('RoomsPage access request', () => {
  const requestJoin = vi.fn();
  const refresh = vi.fn();
  beforeEach(async () => {
    requestJoin.mockReset().mockResolvedValue(undefined);
    refresh.mockReset().mockResolvedValue(undefined);
    const rooms = { select: () => rooms, order: () => Promise.resolve({ data: [], error: null }) };
    await TestBed.configureTestingModule({
      imports: [RoomsPage],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: { isAdmin: () => false } },
        { provide: SupabaseService, useValue: { client: { from: () => rooms } } },
        { provide: LiveUpdatesService, useValue: { revision: signal(0) } },
        { provide: NotificationsService, useValue: { refresh } },
        { provide: AccessService, useValue: { requestJoin, requests: () => Promise.resolve([]) } },
      ],
    })
      .overrideComponent(RoomsPage, { set: { template: '' } })
      .compileComponents();
  });
  it('clears the code and confirms submission after a successful request', async () => {
    const page = TestBed.createComponent(RoomsPage).componentInstance;
    page.roomCode = '123456';
    await page.requestAccess();
    expect(requestJoin).toHaveBeenCalledWith('123456');
    expect(page.roomCode).toBe('');
    expect(page.message()).toContain('Solicitud enviada');
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('preserves the code when submission fails', async () => {
    requestJoin.mockRejectedValue(new Error('Falló la conexión'));
    const page = TestBed.createComponent(RoomsPage).componentInstance;
    page.roomCode = '123456';
    await page.requestAccess();
    expect(page.roomCode).toBe('123456');
    expect(page.error()).toBe('Falló la conexión');
  });
});
