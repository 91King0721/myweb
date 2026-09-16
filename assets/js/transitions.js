/* Theme-specific navigation motion. No page or image data is persisted. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download') || reduce.matches) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('.html') || url.pathname === location.pathname) return;
    event.preventDefault();
    const retro = document.documentElement.dataset.theme === 'retro';
    const main = document.querySelector('main');
    const effect = main.animate(retro ? [{opacity:1},{opacity:0}] : [{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(8px)'}], {duration:retro?180:100,fill:'forwards',easing:'ease-out'});
    effect.finished.then(() => { location.href = url.href; });
  });
  window.addEventListener('pageshow', () => document.querySelector('main')?.getAnimations().forEach(a => a.cancel()));
})();
