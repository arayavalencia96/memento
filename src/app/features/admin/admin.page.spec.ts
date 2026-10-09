import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AdminPage } from './admin.page';
import { RoomsService } from './rooms.service';
import { AuthStore } from '../../core/stores/auth.store';
import { AccessService } from '../access/access.service';
import { signal } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

describe('AdminPage', () => {
  const room = {
    id: 'room-1',
    name: 'Familia',
    description: '',
    photo_limit: 200,
    created_at: '2026-10-08T12:00:00Z',
  };
  const service = { list: vi.fn(), create: vi.fn(), manage: vi.fn() };

  beforeEach(async () => {
    service.list.mockReset().mockResolvedValue([]);
    service.create.mockReset().mockResolvedValue({ room, code: '012345' });
    service.manage.mockReset().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [AdminPage],
      providers: [
        provideRouter([]),
        {
          provide: AccessService,
          useValue: { pendingRequestsCount: signal(0), pendingCount: () => Promise.resolve(0) },
        },
        { provide: RoomsService, useValue: service },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from: () => ({ select: () => Promise.resolve({ count: 2, error: null }) }),
              functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
            },
          },
        },
        {
          provide: AuthStore,
          useValue: {
            profile: () => ({ displayName: 'Admin' }),
            isAuthenticated: () => true,
            isAdmin: () => true,
          },
        },
      ],
    }).compileComponents();
  });

  it('shows statistics before rooms in a single dashboard without the old prompt or rooms tab', async () => {
    service.list.mockResolvedValue([room]);
    const fixture = TestBed.createComponent(AdminPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const text = element.textContent ?? '';
    expect(text.indexOf('Usuarios registrados')).toBeLessThan(text.indexOf('Tus salas'));
    expect(text).not.toContain('¿Quién se suma al próximo recuerdo?');
    expect(element.querySelector('nav a[href="/admin/rooms"]')).toBeNull();
    expect(text).toContain('Familia');
    expect(element.querySelector('app-admin-stats')?.textContent).toContain('1');
  });

  it('creates a room and displays its six-digit code including leading zeros', async () => {
    const fixture = TestBed.createComponent(AdminPage);
    await fixture.whenStable();
    fixture.componentInstance.form.setValue({
      name: '  Familia  ',
      description: '',
      photoLimit: 200,
    });
    await fixture.componentInstance.create();
    fixture.detectChanges();
    expect(service.create).toHaveBeenCalledWith({
      name: 'Familia',
      description: '',
      photoLimit: 200,
    });
    expect(fixture.nativeElement.textContent).toContain('012345');
    expect(fixture.componentInstance.rooms()).toEqual([{ ...room, code: '012345' }]);
  });

  it('does not send invalid names or fractional quotas', async () => {
    const fixture = TestBed.createComponent(AdminPage);
    fixture.componentInstance.form.setValue({ name: ' ', description: '', photoLimit: 1.5 });
    await fixture.componentInstance.create();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('preserves form values when creation fails and shows a retryable error', async () => {
    service.create.mockRejectedValue(new Error('Tu cuenta no tiene permisos para crear salas.'));
    const fixture = TestBed.createComponent(AdminPage);
    fixture.componentInstance.form.patchValue({ name: 'Familia' });
    await fixture.componentInstance.create();
    expect(fixture.componentInstance.form.controls.name.value).toBe('Familia');
    expect(fixture.componentInstance.error()).toContain('permisos');
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it('edits the selected room without creating another one', async () => {
    const fixture = TestBed.createComponent(AdminPage);
    fixture.componentInstance.startEdit(room);
    fixture.componentInstance.editForm.patchValue({ name: 'Familia y amigos' });
    await fixture.componentInstance.saveEdit();
    expect(service.manage).toHaveBeenCalledWith('room-1', 'update', {
      name: 'Familia y amigos',
      description: '',
      photoLimit: 200,
    });
    expect(service.create).not.toHaveBeenCalled();
    expect(fixture.componentInstance.editing()).toBeNull();
  });

  it('waits for confirmation before deleting a room', async () => {
    const fixture = TestBed.createComponent(AdminPage);
    fixture.componentInstance.confirmDelete(room);
    expect(service.manage).not.toHaveBeenCalled();
    await fixture.componentInstance.remove();
    expect(service.manage).not.toHaveBeenCalled();
    fixture.componentInstance.backupConfirmed = true;
    await fixture.componentInstance.remove();
    expect(service.manage).toHaveBeenCalledWith('room-1', 'delete', undefined);
    expect(fixture.componentInstance.deleting()).toBeNull();
  });
});
