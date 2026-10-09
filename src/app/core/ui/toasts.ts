import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { Icon } from './icon';
interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly items = signal<Toast[]>([]);
  private next = 0;
  show(message: string, kind: Toast['kind'] = 'success'): void {
    const id = ++this.next;
    this.items.update((items) => [...items.slice(-3), { id, message, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 5000);
  }
  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }
}
@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `<div class="toast-stack" aria-live="polite" aria-atomic="false">
    @for (toast of service.items(); track toast.id) {
      <div
        class="toast"
        [class.toast-error]="toast.kind === 'error'"
        [class.toast-info]="toast.kind === 'info'"
        [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
      >
        <app-icon [name]="toast.kind === 'success' ? 'check' : 'info'" /><span>{{
          toast.message
        }}</span
        ><button type="button" aria-label="Descartar mensaje" (click)="service.dismiss(toast.id)">
          <app-icon name="close" />
        </button>
      </div>
    }
  </div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Toasts {
  readonly service = inject(ToastService);
}
