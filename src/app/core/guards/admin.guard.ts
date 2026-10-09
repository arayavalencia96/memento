import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../stores/auth.store';

export const adminGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);
  await authStore.initialize();
  return authStore.isAdmin() || router.createUrlTree(['/rooms']);
};
