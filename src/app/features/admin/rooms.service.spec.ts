import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { RoomsService } from './rooms.service';
import { SupabaseService } from '../../core/services/supabase.service';

describe('RoomsService deletion', () => {
  const invoke = vi.fn();
  beforeEach(() => {
    invoke.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: SupabaseService, useValue: { client: { functions: { invoke } } } }],
    });
  });
  it('continues bounded backend batches until the room is deleted', async () => {
    invoke
      .mockResolvedValueOnce({
        data: { ok: true, result: { complete: false, remaining: 2 } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, result: { complete: true, remaining: 0 } },
        error: null,
      });
    await TestBed.inject(RoomsService).manage('room-1', 'delete');
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith('manage-room', {
      body: {
        roomId: 'room-1',
        action: 'delete',
        backupConfirmed: true,
      },
    });
  });
  it('stops when a batch fails so pending cleanup can be retried', async () => {
    invoke
      .mockResolvedValueOnce({
        data: { ok: true, result: { complete: false, remaining: 2 } },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: new Error('Provider unavailable') });
    await expect(TestBed.inject(RoomsService).manage('room-1', 'delete')).rejects.toThrow(
      'No pudimos',
    );
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
