import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { RequestsPage } from './requests.page';
import { AccessService } from '../access/access.service';
import { RoomsService } from './rooms.service';
import { UserRequest } from '../access/access.models';

describe('RequestsPage', () => {
  const request: UserRequest = {
    id: 'request-1',
    user_id: 'member-1',
    room_id: 'room-1',
    kind: 'join',
    status: 'pending',
    created_at: '2026-10-08T12:00:00Z',
    decided_at: null,
  };
  const access = {
    requests: vi.fn(),
    users: vi.fn(),
    decide: vi.fn(),
    pendingCount: vi.fn(),
    pendingRequestsCount: signal(0),
  };

  beforeEach(async () => {
    access.requests.mockReset().mockResolvedValue([request]);
    access.users.mockReset().mockResolvedValue([
      {
        id: 'member-1',
        email: 'guest@example.com',
        display_name: 'Invitado',
        role: 'member',
        enabled: true,
      },
    ]);
    access.decide.mockReset().mockResolvedValue(undefined);
    access.pendingCount.mockResolvedValue(1);
    await TestBed.configureTestingModule({
      imports: [RequestsPage],
      providers: [
        provideRouter([]),
        { provide: AccessService, useValue: access },
        {
          provide: RoomsService,
          useValue: { list: () => Promise.resolve([{ id: 'room-1', name: 'Familia' }]) },
        },
      ],
    }).compileComponents();
  });

  it('loads an existing membership request with the requesting user and room', async () => {
    const fixture = TestBed.createComponent(RequestsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('guest@example.com');
    expect(fixture.nativeElement.textContent).toContain('Familia');
    expect(fixture.componentInstance.pending()).toHaveLength(1);
  });

  it('approves a membership and refreshes the pending list', async () => {
    const fixture = TestBed.createComponent(RequestsPage);
    await fixture.whenStable();
    access.requests.mockResolvedValue([{ ...request, status: 'approved' }]);
    await fixture.componentInstance.decide(request, true);
    expect(access.decide).toHaveBeenCalledWith('request-1', true);
    expect(fixture.componentInstance.pending()).toHaveLength(0);
  });

  it('requires confirmation before approving account deletion', async () => {
    const fixture = TestBed.createComponent(RequestsPage);
    await fixture.whenStable();
    const deletion: UserRequest = { ...request, kind: 'delete_account', room_id: null };
    await fixture.componentInstance.decide(deletion, true);
    expect(access.decide).not.toHaveBeenCalled();
    expect(fixture.componentInstance.deleting()?.id).toBe(deletion.id);
    await fixture.componentInstance.decide(deletion, true);
    expect(access.decide).toHaveBeenCalledWith(deletion.id, true);
  });

  it('keeps a failed decision pending and exposes the server error', async () => {
    const fixture = TestBed.createComponent(RequestsPage);
    await fixture.whenStable();
    access.decide.mockRejectedValue(new Error('La solicitud ya fue resuelta.'));
    await fixture.componentInstance.decide(request, false);
    expect(fixture.componentInstance.error()).toContain('ya fue resuelta');
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.pending()).toHaveLength(1);
  });
});
