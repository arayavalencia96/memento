import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { UsersPage } from './users.page';
import { AccessService } from '../access/access.service';
import { RoomsService } from './rooms.service';
import { ManagedUser } from '../access/access.models';

describe('UsersPage', () => {
  const member: ManagedUser = {
    id: 'member-1',
    email: 'guest@example.com',
    display_name: 'Invitado',
    role: 'member',
    enabled: true,
    created_at: '2026-10-08',
  };
  const access = {
    users: vi.fn(),
    memberships: vi.fn(),
    setEnabled: vi.fn(),
    setMembership: vi.fn(),
    pendingCount: vi.fn(),
    pendingRequestsCount: signal(0),
  };

  beforeEach(async () => {
    access.users.mockReset().mockResolvedValue([member]);
    access.memberships.mockReset().mockResolvedValue([]);
    access.setEnabled.mockReset().mockResolvedValue(undefined);
    access.setMembership.mockReset().mockResolvedValue(undefined);
    access.pendingCount.mockResolvedValue(0);
    await TestBed.configureTestingModule({
      imports: [UsersPage],
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

  it('suspends an account only after confirmation', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    await fixture.whenStable();
    fixture.componentInstance.toggleUser(member);
    expect(access.setEnabled).not.toHaveBeenCalled();
    await fixture.componentInstance.confirm();
    expect(access.setEnabled).toHaveBeenCalledWith(member.id, false);
  });

  it('revokes only the selected room membership', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    await fixture.whenStable();
    fixture.componentInstance.changeAccess(member.id, 'room-1', false);
    await fixture.componentInstance.confirm();
    expect(access.setMembership).toHaveBeenCalledWith(member.id, 'room-1', 'revoked');
    expect(access.setEnabled).not.toHaveBeenCalled();
  });
});
