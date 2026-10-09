import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';
import { vi } from 'vitest';
describe('Modal', () => {
  beforeAll(() => {
    // jsdom no implementa la API nativa del diálogo; se simula sólo en estas pruebas.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement): void {
        this.open = true;
      },
    });
  });
  afterAll(() => Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal'));
  it('opens a native modal and permits cancellation when idle', async () => {
    await TestBed.configureTestingModule({ imports: [Modal] }).compileComponents();
    const fixture = TestBed.createComponent(Modal);
    fixture.componentRef.setInput('title', 'Confirmar');
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(closed).toHaveBeenCalledOnce();
  });
  it('prevents Escape from closing during a pending operation', async () => {
    await TestBed.configureTestingModule({ imports: [Modal] }).compileComponents();
    const fixture = TestBed.createComponent(Modal);
    fixture.componentRef.setInput('title', 'Guardando');
    fixture.componentRef.setInput('busy', true);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    await fixture.whenStable();
    const event = new Event('cancel', { cancelable: true });
    fixture.nativeElement.querySelector('dialog').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(closed).not.toHaveBeenCalled();
  });
});
