'use strict';

// Widget de compte partagé (cooloss) — même pattern que
// media-gallery/static/account-widget.js et blackjackoss/js/account-widget.js.
const AccountWidget = (() => {
  const COOLOSS = 'https://cooloss.nathangracia.com';
  let session = { loggedIn: false, isAdmin: false, username: null, displayName: null, avatarFile: null };

  async function load() {
    try {
      session = await (await fetch('/api/whoami')).json();
    } catch (_) {
      session = { loggedIn: false, isAdmin: false, username: null, displayName: null, avatarFile: null };
    }
    return session;
  }

  function name() {
    return session.displayName || session.username || '';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mount(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!session.loggedIn) {
      el.innerHTML = `<a href="${COOLOSS}/login?next=${encodeURIComponent(location.href)}" class="account-widget-login">Se connecter</a>`;
      return;
    }

    const initials = esc(name()).slice(0, 2).toUpperCase();
    const avatar = session.avatarFile
      ? `<img src="${esc(session.avatarFile)}" alt="" class="account-widget-avatar">`
      : `<span class="account-widget-avatar account-widget-avatar--fallback">${initials}</span>`;

    el.innerHTML = `
      <div class="account-widget">
        <button class="account-widget-trigger" id="account-widget-trigger" type="button">
          ${avatar}
          <span class="account-widget-name">${esc(name())}</span>
        </button>
        <div class="account-widget-menu" id="account-widget-menu" hidden>
          ${session.isAdmin ? '<div class="account-widget-badge">Admin</div>' : ''}
          <a href="${COOLOSS}/">← Retourner sur cooloss</a>
          <a href="${COOLOSS}/profile/edit" target="_blank" rel="noopener noreferrer">Modifier le profil</a>
          <a href="${COOLOSS}/api/logout?next=${encodeURIComponent(location.href)}">Se déconnecter</a>
        </div>
      </div>`;

    const trigger = document.getElementById('account-widget-trigger');
    const menu = document.getElementById('account-widget-menu');
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', e => {
      if (!menu.hidden && !el.contains(e.target)) menu.hidden = true;
    });
  }

  return {
    load,
    mount,
    get session() { return session; },
  };
})();
