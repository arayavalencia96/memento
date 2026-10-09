import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly dark = signal(localStorage.getItem('memento-theme') === 'dark');

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.dark.update((value) => !value);
    localStorage.setItem('memento-theme', this.dark() ? 'dark' : 'light');
    this.apply();
  }

  private apply(): void {
    document.documentElement.classList.toggle('dark', this.dark());
  }
}
