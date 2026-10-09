import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icon } from './icon';
import { Toasts } from './toasts';

@Component({
  selector: 'app-modal',
  imports: [Icon, Toasts],
  template: `<dialog
    #dialog
    class="memento-dialog"
    (cancel)="cancel($event)"
    (click)="backdrop($event)"
  >
    <div class="modal-heading">
      <h2>{{ title() }}</h2>
      <button
        type="button"
        class="icon-button"
        aria-label="Cerrar"
        [disabled]="busy()"
        (click)="closed.emit()"
      >
        <app-icon name="close" />
      </button>
    </div>
    <ng-content /><app-toasts />
  </dialog>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Modal {
  readonly title = input.required<string>();
  readonly busy = input(false);
  readonly closed = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.setAttribute('aria-label', this.title());
      el.showModal();
    });
  }
  cancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.closed.emit();
  }
  backdrop(event: MouseEvent): void {
    const el = this.dialog().nativeElement;
    const r = el.getBoundingClientRect();
    if (
      event.target === el &&
      (event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom) &&
      !this.busy()
    )
      this.closed.emit();
  }
}
