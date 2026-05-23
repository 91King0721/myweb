/**
 * Shared industrial page transition.
 */
(function () {
  var TRANSITION_KEY = 'classroomPageTransitionDirection';
  var EXIT_MS = 24;
  var ENTER_MS = 460;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function normalizePath(pathname) {
    return pathname.replace(/\/$/, '/index.html');
  }

  function isSameSiteHtmlLink(link) {
    if (!link || link.target || link.hasAttribute('download')) return false;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return false;

    var url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;

    var currentPath = normalizePath(window.location.pathname);
    var targetPath = normalizePath(url.pathname);
    return currentPath !== targetPath && /\.html$/.test(targetPath);
  }

  function getDirection(link) {
    var targetPath = normalizePath(new URL(link.href, window.location.href).pathname);
    return targetPath.indexOf('query.html') !== -1 ? 'forward' : 'back';
  }

  function bootTransitionLayer() {
    if (prefersReducedMotion) return;

    var layer = document.createElement('div');
    layer.className = 'page-transition-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    var direction = sessionStorage.getItem(TRANSITION_KEY);
    sessionStorage.removeItem(TRANSITION_KEY);
    document.body.classList.add('transition-ready');

    if (!direction) return;

    document.body.classList.add('is-entering', 'enter-' + direction);
    window.setTimeout(function () {
      document.body.classList.remove('is-entering', 'enter-forward', 'enter-back');
    }, ENTER_MS + 80);
  }

  function navigateWithTransition(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest('a');
    if (!isSameSiteHtmlLink(link) || prefersReducedMotion) return;

    var direction = getDirection(link);
    event.preventDefault();
    sessionStorage.setItem(TRANSITION_KEY, direction);
    document.body.classList.remove('is-entering', 'enter-forward', 'enter-back');
    document.body.classList.add('is-leaving', 'leave-' + direction);
    window.setTimeout(function () {
      window.location.href = link.href;
    }, EXIT_MS);
  }

  document.addEventListener('DOMContentLoaded', bootTransitionLayer);
  document.addEventListener('click', navigateWithTransition);
})();
