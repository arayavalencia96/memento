import { ToastService } from './toasts';
import { vi } from 'vitest';
describe('ToastService', () => {
  afterEach(() => vi.useRealTimers());
  it('removes success messages after five seconds and errors after seven', () => {
    vi.useFakeTimers();
    const service = new ToastService();
    service.show('Guardado');
    service.show('Error', 'error');
    expect(service.items()).toHaveLength(2);
    vi.advanceTimersByTime(5000);
    expect(service.items().map((item) => item.message)).toEqual(['Error']);
    vi.advanceTimersByTime(2000);
    expect(service.items()).toHaveLength(0);
  });
  it('limits the stack and allows manual dismissal', () => {
    vi.useFakeTimers();
    const service = new ToastService();
    for (let n = 0; n < 8; n++) service.show(String(n));
    expect(service.items()).toHaveLength(4);
    service.dismiss(service.items()[0].id);
    expect(service.items()).toHaveLength(3);
  });
});
