// Botão "copiar" nos blocos de código (RF-12). Sem JS, os blocos continuam legíveis.
const container = document.querySelector<HTMLElement>('[data-copy-label]');

if (container && navigator.clipboard) {
  const label = container.dataset.copyLabel ?? 'Copy';
  const done = container.dataset.copyDone ?? 'Copied';

  for (const pre of container.querySelectorAll('pre')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    pre.replaceWith(wrapper);
    wrapper.append(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? pre.innerText);
        button.textContent = done;
        setTimeout(() => (button.textContent = label), 2000);
      } catch {
        // Clipboard negado: o usuário ainda pode selecionar o texto.
      }
    });
    wrapper.append(button);
  }
}

export {};
