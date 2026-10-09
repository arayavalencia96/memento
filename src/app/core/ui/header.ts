import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { NotificationsService } from '../services/notifications.service';
import { requestLabels, requestStatusLabels } from '../../features/access/access.models';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../stores/auth.store';
import { ThemeService } from '../services/theme.service';
import { SupabaseService } from '../services/supabase.service';
import { AccessService } from '../../features/access/access.service';
import { Icon } from './icon';
import { Modal } from './modal';
import { ToastService } from './toasts';

@Component({
  selector: 'app-header',
  imports: [RouterLink, FormsModule, Icon, Modal, DatePipe],
  template: `
    <header class="app-header">
      <div class="header-inner">
        <a
          class="brand"
          [routerLink]="auth.isAuthenticated() ? (auth.isAdmin() ? '/admin' : '/rooms') : '/'"
          ><img src="/favicon.svg" width="30" height="30" alt="" />MEMENTO<span>.</span></a
        >
        <div class="header-actions">
          <button
            class="icon-button"
            type="button"
            (click)="theme.toggle()"
            [attr.aria-label]="theme.dark() ? 'Activar tema claro' : 'Activar tema oscuro'"
            [title]="theme.dark() ? 'Tema claro' : 'Tema oscuro'"
          >
            <app-icon [name]="theme.dark() ? 'sun' : 'moon'" />
          </button>
          @if (auth.isAuthenticated()) {
            @if (!auth.isAdmin()) {
              <div class="notifications-menu">
                <button
                  type="button"
                  class="icon-button notification-toggle"
                  [attr.aria-label]="'Notificaciones: ' + notifications.unread() + ' no leídas'"
                  [attr.aria-expanded]="notificationsOpen()"
                  aria-controls="request-notifications"
                  title="Notificaciones"
                  (click)="toggleNotifications()"
                >
                  <app-icon name="bell" />
                  @if (notifications.unread()) {
                    <span class="notification-badge">{{ notifications.unread() }}</span>
                  }
                </button>
                @if (notificationsOpen()) {
                  <section
                    class="dropdown notifications-dropdown"
                    id="request-notifications"
                    aria-label="Mis solicitudes"
                  >
                    <h2 class="font-semibold">Mis solicitudes</h2>
                    @if (notifications.error()) {
                      <p role="alert">{{ notifications.error() }}</p>
                    } @else {
                      @for (item of notifications.items(); track item.id) {
                        <div class="notification-item">
                          <div class="flex justify-between gap-3 text-sm">
                            <span>{{ requestLabels[item.kind] }}</span>
                            <span class="muted">{{ requestStatuses[item.status] }}</span>
                          </div>
                          <time class="muted text-xs" [attr.datetime]="item.activity_at">
                            {{ item.activity_at | date: 'dd/MM/yyyy HH:mm' }}
                          </time>
                        </div>
                      } @empty {
                        <p class="muted text-sm">Todavía no tenés notificaciones.</p>
                      }
                    }
                  </section>
                }
              </div>
            }
            <div class="avatar-menu">
              <button
                type="button"
                class="avatar"
                aria-label="Menú de tu cuenta"
                [attr.aria-expanded]="menu()"
                aria-haspopup="menu"
                (click)="notificationsOpen.set(false); menu.set(!menu())"
              >
                @if (auth.profile()?.avatarUrl; as image) {
                  <img [src]="image" alt="Tu foto de perfil" referrerpolicy="no-referrer" />
                } @else {
                  {{ firstName().charAt(0) }}
                }
              </button>
              @if (menu()) {
                <div class="dropdown" role="menu">
                  <p>{{ firstName() }}</p>
                  <button type="button" role="menuitem" (click)="openProfile()">Mi perfil</button
                  ><button type="button" role="menuitem" (click)="signOut()">Cerrar sesión</button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </header>
    @if (profileOpen()) {
      <app-modal title="Mi perfil" [busy]="busy()" (closed)="profileOpen.set(false)"
        ><form (ngSubmit)="saveProfile()" class="form-stack">
          <label
            >Nombre<input name="displayName" [(ngModel)]="displayName" required maxlength="80"
          /></label>
          <p class="muted text-sm">{{ auth.profile()?.email }} · Cuenta de Google</p>
          <div class="modal-actions">
            <button
              type="button"
              class="secondary"
              (click)="profileOpen.set(false)"
              [disabled]="busy()"
            >
              Cancelar</button
            ><button class="primary" [disabled]="busy() || !displayName.trim()">
              Guardar cambios
            </button>
          </div>
        </form>
        @if (!auth.isAdmin()) {
          <details class="account-options">
            <summary>Opciones de la cuenta</summary>
            <p class="muted text-sm">Podés solicitar la baja. El administrador debe aprobarla.</p>
            <button
              type="button"
              class="danger-link"
              [disabled]="busy()"
              (click)="profileOpen.set(false); deletion.set(true)"
            >
              Solicitar baja de mi cuenta
            </button>
          </details>
        }
      </app-modal>
    }
    @if (deletion()) {
      <app-modal
        title="¿Solicitar la baja de tu cuenta?"
        [busy]="busy()"
        (closed)="deletion.set(false)"
        ><p>
          Se enviará una solicitud al administrador. Hasta su aprobación mantenés el acceso. Tus
          fotos compartidas permanecerán sin identificarte como autor.
        </p>
        <div class="modal-actions">
          <button class="secondary" [disabled]="busy()" (click)="deletion.set(false)">
            Cancelar</button
          ><button class="danger" [disabled]="busy()" (click)="requestDeletion()">
            Solicitar baja
          </button>
        </div></app-modal
      >
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  readonly auth = inject(AuthStore);
  readonly theme = inject(ThemeService);
  readonly notifications = inject(NotificationsService);
  readonly notificationsOpen = signal(false);
  readonly requestLabels = requestLabels;
  readonly requestStatuses = requestStatusLabels;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly access = inject(AccessService);
  private readonly toast = inject(ToastService);
  readonly menu = signal(false);
  readonly profileOpen = signal(false);
  readonly deletion = signal(false);
  readonly busy = signal(false);
  displayName = '';
  firstName(): string {
    return (this.auth.profile()?.displayName || 'Invitado').trim().split(/\s+/)[0];
  }
  @HostListener('document:click', ['$event']) outside(event: Event): void {
    if (
      !this.host.nativeElement.querySelector('.notifications-menu')?.contains(event.target as Node)
    )
      this.notificationsOpen.set(false);
    if (!this.host.nativeElement.querySelector('.avatar-menu')?.contains(event.target as Node))
      this.menu.set(false);
  }
  @HostListener('document:keydown.escape') escape(): void {
    this.notificationsOpen.set(false);
    this.menu.set(false);
  }
  async toggleNotifications(): Promise<void> {
    this.notificationsOpen.update((open) => !open);
    this.menu.set(false);
    if (this.notificationsOpen()) await this.notifications.markRead();
  }
  openProfile(): void {
    this.displayName = this.auth.profile()?.displayName ?? '';
    this.menu.set(false);
    this.profileOpen.set(true);
  }
  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
      this.menu.set(false);
      await this.router.navigateByUrl('/');
    } catch {
      this.toast.show('No pudimos cerrar sesión.', 'error');
    }
  }
  async saveProfile(): Promise<void> {
    if (this.busy() || !this.displayName.trim() || this.displayName.trim().length > 80) return;
    this.busy.set(true);
    try {
      const { data, error } = await this.supabase.client.functions.invoke('member-profile', {
        body: { displayName: this.displayName.trim() },
      });
      if (error || !data?.ok) throw new Error();
      await this.auth.refreshProfile();
      this.profileOpen.set(false);
      this.toast.show('Perfil actualizado.');
    } catch {
      this.toast.show('No pudimos actualizar tu perfil.', 'error');
    } finally {
      this.busy.set(false);
    }
  }
  async requestDeletion(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.access.requestDeletion();
      this.deletion.set(false);
      this.toast.show('Solicitud de baja enviada.', 'info');
    } catch (error) {
      this.toast.show(
        error instanceof Error ? error.message : 'No pudimos enviar la solicitud.',
        'error',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
