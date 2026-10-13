/* Eko Rush – light / dark theme controller (shared by landing page + game) */
// =====================================================================
// FILE OVERVIEW
// This file controls the light/dark colour theme for the whole site.
// How it is organised:
//   1. sync(theme)  – updates every theme toggle button + the browser's theme colour.
//   2. set(theme)   – switches the theme, saves it, and announces the change.
//   3. A click listener that flips the theme when any [data-theme-toggle] element is clicked.
//   4. Start-up code that picks the initial theme (saved choice, or the OS preference).
//   5. window.EkoTheme – a small public object other scripts use to read or set the theme.
// The current theme lives on <html data-theme="light|dark">; CSS uses that attribute
// to choose colours. The choice is remembered in localStorage under 'ekorush-theme'.
// =====================================================================
// Wrap everything in a function that runs immediately (an "IIFE") so our variables
// don't leak into the global scope and clash with other scripts.
(function () {
  // Strict mode makes JavaScript report more mistakes as errors instead of silently ignoring them.
  'use strict';
  // The <html> element; we store the theme on it as data-theme="...".
  const root = document.documentElement;
  // The key (name) under which the theme is saved in localStorage.
  // localStorage is a small key/value store in the browser that survives page reloads.
  const KEY = 'ekorush-theme';

  // sync(theme): make every theme toggle button (and the browser UI colour) match the theme.
  // Parameter: theme – 'light' or 'dark'. Returns nothing; only updates the page.
  function sync(theme) {
    // Find every element marked as a theme toggle and update each one.
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      // aria-pressed tells screen readers whether the toggle is "on" (dark mode).
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
      // aria-label is the spoken description; it says what clicking will do next.
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      // title is the tooltip shown when hovering with a mouse.
      btn.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
    });
    // The <meta name="theme-color"> tag colours the browser bar on mobile devices.
    const meta = document.querySelector('meta[name="theme-color"]');
    // If that tag exists, set it to a near-black or white to match the theme.
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f0f12' : '#ffffff');
  }

  // set(theme): switch the site to the given theme.
  // Parameter: theme – 'light' or 'dark'.
  // Side effects: updates <html data-theme>, saves to localStorage, updates buttons,
  // and fires a 'themechange' event so other scripts (like the 3D scenes) can react.
  function set(theme) {
    // Changing data-theme on <html> makes the CSS switch colours instantly.
    root.dataset.theme = theme;
    // Save the choice; wrapped in try/catch because private browsing can block localStorage.
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode */ }
    // Update the toggle buttons and browser colour to match.
    sync(theme);
    // Broadcast a custom event. A "custom event" is our own named event that any
    // script can listen for with addEventListener('themechange', ...). detail carries the new theme.
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  // Listen for clicks anywhere on the page (one listener handles every toggle button,
  // even ones added later – this pattern is called "event delegation").
  document.addEventListener('click', (e) => {
    // closest() walks up from the clicked element to find a theme toggle, if any.
    const btn = e.target.closest('[data-theme-toggle]');
    // The click wasn't on a toggle, so ignore it.
    if (!btn) return;
    // Flip the theme: dark becomes light, anything else becomes dark.
    set(root.dataset.theme === 'dark' ? 'light' : 'dark');
    // Remove keyboard focus from the button so it doesn't keep a focus outline.
    btn.blur();
  });

  // If the page didn't already set a theme (e.g. via an inline script), choose one now.
  if (!root.dataset.theme) {
    // Default to light.
    let t = 'light';
    // Prefer the saved choice; otherwise follow the operating system's dark-mode setting.
    // matchMedia checks a CSS media query from JavaScript. try/catch guards against blocked storage.
    try { t = localStorage.getItem(KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* ignore */ }
    // Apply the chosen theme to <html>.
    root.dataset.theme = t;
  }
  // Buttons may not exist yet while the page is loading, so sync them once the HTML is fully parsed.
  document.addEventListener('DOMContentLoaded', () => sync(root.dataset.theme));

  // Public API: other scripts call window.EkoTheme.get(), .isDark() or .set('dark').
  window.EkoTheme = {
    // Returns the current theme name ('light' or 'dark').
    get: () => root.dataset.theme,
    // Returns true when the dark theme is active.
    isDark: () => root.dataset.theme === 'dark',
    // Exposes the set() function defined above (shorthand for set: set).
    set,
  };
// Close and immediately call the wrapping function.
})();
