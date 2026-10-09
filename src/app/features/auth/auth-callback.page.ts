import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';

@Component({
  template:
    '<main class="grid min-h-screen place-items-center bg-stone-50 text-stone-700 dark:bg-stone-950 dark:text-stone-200">Signing you in…</main>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthCallbackPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  constructor() {
    void this.completeSignIn();
  }

  private async completeSignIn(): Promise<void> {
    await this.auth.initialize();
    await this.router.navigateByUrl(this.auth.isAdmin() ? '/admin' : '/rooms');
  }
}
