import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage) },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/auth-callback.page').then((m) => m.AuthCallbackPage),
  },
  {
    path: 'rooms',
    canActivate: [authGuard],
    loadComponent: () => import('./features/rooms/rooms.page').then((m) => m.RoomsPage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
  },
  {
    path: 'admin/rooms',
    redirectTo: 'admin',
    pathMatch: 'full',
  },
  {
    path: 'rooms/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/photos/album.page').then((m) => m.AlbumPage),
  },
  {
    path: 'admin/users',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/users.page').then((m) => m.UsersPage),
  },
  {
    path: 'admin/requests',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/requests.page').then((m) => m.RequestsPage),
  },
  { path: '**', redirectTo: '' },
];
