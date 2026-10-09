import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '../../core/stores/auth.store';
import { Header } from '../../core/ui/header';
import { Icon } from '../../core/ui/icon';
import { ToastService } from '../../core/ui/toasts';
@Component({
  imports: [Header, Icon],
  template: ` <app-header />
    <main class="landing">
      <div class="landing-glow" style="background:#d5b5f6;top:-150px;left:-100px"></div>
      <div class="landing-glow" style="background:#ffcbb2;bottom:-150px;right:-80px"></div>
      <div class="landing-copy">
        <section>
          <p class="eyebrow">Los momentos pasan. Los recuerdos quedan.</p>
          <h1 class="mt-5 text-6xl font-semibold tracking-tight sm:text-8xl">
            Un lugar para<br /><span style="color:var(--accent)">lo nuestro.</span>
          </h1>
          <p class="muted mt-7 max-w-md text-lg leading-8">
            Ese viaje, un cumpleaños, una foto cada mes. Guardá los pequeños momentos con las
            personas que hacen grande tu vida.
          </p>
          <button type="button" class="primary mt-9" [disabled]="loading()" (click)="signIn()">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21 12c0-.7-.1-1.4-.2-2H12v4h5a5 5 0 0 1-5 4 6 6 0 1 1 4-10l3-3A10 10 0 1 0 12 22c6 0 9-4 9-10"
              /></svg
            >{{ loading() ? 'Conectando…' : 'Continuar con Google' }}
          </button>
          <p class="muted mt-4 text-xs">Álbumes privados. Solo vos y quienes elijas.</p>
        </section>
        <div class="memory-art" aria-hidden="true">
          <div class="memory-print" style="left:5%;top:20px;transform:rotate(-12deg)">
            <div><app-icon name="photo" /></div>
          </div>
          <div class="memory-print" style="right:4%;top:110px;transform:rotate(10deg)">
            <div style="background:linear-gradient(140deg,#f8d6b8,#ecd9f9)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1s-1 6 2 9l6 6 6-6c3-3 5-6 2-9Z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </main>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly loading = signal(false);
  constructor() {
    void this.redirect();
  }
  private async redirect(): Promise<void> {
    await this.auth.initialize();
    if (this.auth.isAuthenticated())
      await this.router.navigateByUrl(this.auth.isAdmin() ? '/admin' : '/rooms');
  }
  async signIn(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.auth.signInWithGoogle();
    } catch {
      this.toast.show('No pudimos iniciar sesión con Google.', 'error');
      this.loading.set(false);
    }
  }
}
