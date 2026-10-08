/** Comportamentos globais: botões de copiar e alternância de tema. */
import { strings } from './fmt.ts';

export function initCopyButtons(root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    if (button.dataset.copyReady) continue;
    button.dataset.copyReady = '1';
    button.addEventListener('click', async () => {
      const target = button.dataset.copyTarget ? document.getElementById(button.dataset.copyTarget) : null;
      const text = target ? target.textContent || '' : button.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(text.trim());
      } catch {
        return;
      }
      const label = button.querySelector('[data-copy-label]') || button;
      const original = label.textContent;
      label.textContent = strings().copied;
      button.classList.add('is-copied');
      window.setTimeout(() => {
        label.textContent = original;
        button.classList.remove('is-copied');
      }, 1600);
    });
  }
}

export function initThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  if (!button) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const effective = () =>
    (document.documentElement.dataset.theme as 'light' | 'dark' | undefined) ?? (media.matches ? 'dark' : 'light');
  const sync = () => {
    const theme = effective();
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = strings().theme[theme];
  };
  button.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* modo privado */
    }
    sync();
  });
  media.addEventListener('change', sync);
  sync();
}
