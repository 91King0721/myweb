/**
 * Shared industrial page transition.
 */
(function () {
  var TRANSITION_KEY = 'classroomPageTransitionDirection';
  var EXIT_MS = 24;
  var ENTER_MS = 460;
  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var prewarmedTargets = Object.create(null);
  var prewarmImages = [];

  function isCompactViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

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

  function addPrefetch(href, as, type, media) {
    var existing = document.head.querySelector('link[href="' + href + '"]');
    if (existing) return;

    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = href;
    if (as) link.as = as;
    if (type) link.type = type;
    if (media) link.media = media;
    document.head.appendChild(link);
  }

  function warmImage(href) {
    var image = new Image();
    image.decoding = 'async';
    image.src = href;
    if (image.decode) {
      image.decode().catch(function() {});
    }
    prewarmImages.push(image);
    if (prewarmImages.length > 4) prewarmImages.shift();
  }

  function prewarmNavigationTarget(link) {
    if (!isSameSiteHtmlLink(link)) return;

    var url = new URL(link.href, window.location.href);
    var targetPath = normalizePath(url.pathname);
    if (prewarmedTargets[targetPath]) return;
    prewarmedTargets[targetPath] = true;

    addPrefetch(url.href, 'document');

    if (targetPath.indexOf('query.html') !== -1) {
      addPrefetch('assets/js/data.js', 'script');
      addPrefetch('assets/js/app.js', 'script');
    }

    addPrefetch('assets/images/industrial-desktop.webp', 'image', 'image/webp', '(min-width: 769px)');
    addPrefetch('assets/images/industrial-mobile.webp', 'image', 'image/webp', '(max-width: 768px)');

    if (window.matchMedia('(max-width: 768px)').matches) {
      warmImage('assets/images/industrial-mobile.webp');
    } else {
      warmImage('assets/images/industrial-desktop.webp');
    }
  }

  function bootTransitionLayer() {
    if (prefersReducedMotion || isCompactViewport()) return;

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
    if (!isSameSiteHtmlLink(link)) return;

    var direction = getDirection(link);
    prewarmNavigationTarget(link);
    if (prefersReducedMotion || isCompactViewport()) return;

    event.preventDefault();
    sessionStorage.setItem(TRANSITION_KEY, direction);
    document.body.classList.remove('is-entering', 'enter-forward', 'enter-back');
    document.body.classList.add('is-leaving', 'leave-' + direction);
    window.setTimeout(function () {
      window.location.href = link.href;
    }, EXIT_MS);
  }

  function prewarmFromEvent(event) {
    var link = event.target.closest('a');
    prewarmNavigationTarget(link);
  }

  document.addEventListener('DOMContentLoaded', bootTransitionLayer);
  document.addEventListener('pointerover', prewarmFromEvent, { passive: true });
  document.addEventListener('touchstart', prewarmFromEvent, { passive: true });
  document.addEventListener('focusin', prewarmFromEvent);
  document.addEventListener('click', navigateWithTransition);
})();
