// Aplica o tema salvo antes da primeira pintura (arquivo externo: a CSP não permite script inline).
(function () {
  try {
    var theme = localStorage.getItem('theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
