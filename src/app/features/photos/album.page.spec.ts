import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AlbumPage } from './album.page';
import { AlbumPhoto, PhotosService } from './photos.service';
import { AuthStore } from '../../core/stores/auth.store';
import { ToastService } from '../../core/ui/toasts';

describe('AlbumPage', () => {
  const photo: AlbumPhoto = {
    id: 'photo-1',
    description: 'Un mes más',
    people: ['Ana', 'Luna'],
    location: 'Mendoza',
    uploadedBy: 'user-1',
    uploadedAt: '2026-10-09T12:00:00Z',
    authorName: 'Ana',
    url: 'https://example.com/photo.jpg',
    canEdit: true,
  };
  const service = { list: vi.fn(), upload: vi.fn(), edit: vi.fn(), delete: vi.fn(), url: vi.fn() };
  const toast = { show: vi.fn() };
  beforeEach(async () => {
    Object.values(service).forEach((mock) => mock.mockReset());
    toast.show.mockReset();
    service.list.mockResolvedValue({
      room: { id: 'room-1', name: 'Nosotros', description: 'Recuerdos', photo_limit: 100 },
      photos: [photo],
      hasMore: false,
    });
    service.url.mockResolvedValue('https://example.com/fresh.jpg');
    await TestBed.configureTestingModule({
      imports: [AlbumPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: new Map([['id', 'room-1']]) } },
        },
        { provide: PhotosService, useValue: service },
        { provide: ToastService, useValue: toast },
        {
          provide: AuthStore,
          useValue: {
            isAuthenticated: () => true,
            isAdmin: () => false,
            profile: () => ({ displayName: 'Ana María' }),
          },
        },
      ],
    }).compileComponents();
  });
  it('opens the album separately and fetches its newest-first first page', async () => {
    const fixture = TestBed.createComponent(AlbumPage);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.list).toHaveBeenCalledWith('room-1', 0);
    expect(fixture.nativeElement.textContent).toContain('Nosotros');
    expect(fixture.componentInstance.photos()).toEqual([photo]);
  });
  it('does not upload until a file is selected', async () => {
    const fixture = TestBed.createComponent(AlbumPage);
    fixture.componentInstance.newPhoto();
    await fixture.componentInstance.save();
    expect(service.upload).not.toHaveBeenCalled();
    expect(toast.show).toHaveBeenCalledWith('Elegí una foto.', 'error');
  });
  it('submits typed metadata and closes the upload modal on success', async () => {
    const fixture = TestBed.createComponent(AlbumPage);
    const page = fixture.componentInstance;
    page.newPhoto();
    page.file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    page.people = 'Ana, Luna';
    page.description = '  Un recuerdo  ';
    page.location = ' Mendoza ';
    await page.save();
    expect(service.upload).toHaveBeenCalledWith('room-1', page.file, {
      description: 'Un recuerdo',
      people: ['Ana', 'Luna'],
      location: 'Mendoza',
    });
    expect(page.uploading()).toBe(false);
  });
  it('requires confirmation before deleting the chosen photo', async () => {
    const fixture = TestBed.createComponent(AlbumPage);
    const page = fixture.componentInstance;
    page.deletePhoto(photo);
    expect(service.delete).not.toHaveBeenCalled();
    await page.remove();
    expect(service.delete).toHaveBeenCalledWith('room-1', 'photo-1');
    expect(page.deleting()).toBeNull();
  });
  it('keeps the form open and shows an error when quota is exhausted', async () => {
    service.upload.mockRejectedValue(new Error('La sala alcanzó su límite de fotos.'));
    const fixture = TestBed.createComponent(AlbumPage);
    const page = fixture.componentInstance;
    page.newPhoto();
    page.file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    await page.save();
    expect(page.uploading()).toBe(true);
    expect(page.busy()).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('La sala alcanzó su límite de fotos.', 'error');
  });
  it('requests a fresh private link before opening a photo', async () => {
    const fixture = TestBed.createComponent(AlbumPage);
    const page = fixture.componentInstance;
    await page.view(photo);
    expect(service.url).toHaveBeenCalledWith('room-1', 'photo-1');
    expect(page.selected()?.url).toBe('https://example.com/fresh.jpg');
  });
});
