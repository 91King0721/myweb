(() => {
  // New preference namespace: ignore all pre-release preview choices.
  // This key is written only after an explicit sw command; keep it stable.
  const key = 'classroom-theme-choice-v1';
  const revision = '20260918-glass-default-v1';
  const validThemes = ['modern', 'retro', 'glass'];
  function readChoice() {
    try {
      const saved = localStorage.getItem(key);
      if (validThemes.includes(saved)) return saved;
    } catch (_) {}
    return 'glass';
  }
  let theme = readChoice();
  document.documentElement.dataset.theme = theme;
  const text = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
  function apply(value, animate) {
    theme = value;
    document.documentElement.dataset.theme = value;
    // Theme is local-only. Old/bookmarked/shared URLs cannot override it.
    const current = new URL(location.href);
    current.searchParams.delete('theme');
    current.searchParams.set('v', revision);
    try { history.replaceState(history.state, '', current.href); } catch (_) {}
    document.querySelectorAll('a[href], link[rel="prefetch"][as="document"]').forEach(link => {
      const target = new URL(link.getAttribute('href'), location.href);
      if (target.origin !== current.origin || !/\/(index|query)\.html$/.test(target.pathname)) return;
      target.searchParams.delete('theme');
      target.searchParams.set('v', revision);
      link.href = target.href;
    });
    const retro = value === 'retro';
    const glass = value === 'glass';
    text('.landing-label', retro ? 'Classroom Availability Finder' : 'CLASSROOM AVAILABILITY FINDER');
    text('.btn-cta', glass ? '发现空闲教室' : retro ? '寻找空闲教室' : '启动查询终端');
    text('.page-title', glass ? '让下一段专注，有处可去。' : retro ? '寻找一间空闲教室' : '教室课表查询终端');
    text('.landing-footer p', retro ? '留一段时间，安静地读书。' : '教室查询 · 整学期课表');
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const main = document.querySelector('main');
      main.getAnimations().forEach(animation => animation.cancel());
      main.animate(retro ? [{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}] : [{opacity:.5,transform:'translateX(-6px)'},{opacity:1,transform:'translateX(0)'}], {duration:retro?420:180,easing:'ease-out'});
    }
  }
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    apply(readChoice(), false);
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(readChoice(), false);
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(theme, false);
    const search = document.getElementById('searchInput');
    if (!search) return;
    function consumeThemeCommand() {
      if (search.value !== 'sw') return false;
      search.value = '';
      const next = { retro: 'modern', modern: 'glass', glass: 'retro' }[theme];
      try { localStorage.setItem(key, next); } catch (_) {}
      apply(next, true);
      return true;
    }
    // Capture runs before the existing inline search handler, so it renders
    // the cleared query rather than treating the command as a room number.
    search.addEventListener('input', event => {
      if (!event.isComposing) consumeThemeCommand();
    }, true);
    search.addEventListener('compositionend', () => {
      if (consumeThemeCommand() && typeof window.render === 'function') window.render();
    });
  });
})();
