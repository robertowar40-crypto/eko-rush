/* Eko Rush – light / dark theme controller (shared by landing page + game) */
(function () {
  'use strict';
  const root = document.documentElement;
  const KEY = 'ekorush-theme';

  function sync(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      btn.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f0f12' : '#ffffff');
  }

  function set(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode */ }
    sync(theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    set(root.dataset.theme === 'dark' ? 'light' : 'dark');
    btn.blur();
  });

  if (!root.dataset.theme) {
    let t = 'light';
    try { t = localStorage.getItem(KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    root.dataset.theme = t;
  }
  document.addEventListener('DOMContentLoaded', () => sync(root.dataset.theme));

  window.EkoTheme = {
    get: () => root.dataset.theme,
    isDark: () => root.dataset.theme === 'dark',
    set,
  };
})();
