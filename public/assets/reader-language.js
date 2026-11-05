/* Functional language choice for passive static readers. No network or tracking. */
(() => {
  const links = document.querySelectorAll('nav.plan-language-choice a[data-locale-choice]');
  if (links.length !== 2) return;
  for (const link of links) {
    const locale = link.getAttribute('data-locale-choice');
    if (locale !== 'en' && locale !== 'es') return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin) return;
    link.addEventListener('click', () => {
      try { localStorage.setItem('preferred_locale', locale); } catch { /* Navigation still works. */ }
      const target = new URL(link.href, location.href);
      if (target.origin !== location.origin) return;
      target.search = location.search;
      if (location.hash) {
        try {
          const id = decodeURIComponent(location.hash.slice(1));
          if (document.getElementById(id)) target.hash = location.hash;
        } catch { /* Ignore a malformed fragment. */ }
      }
      link.href = target.href;
    });
  }
})();
