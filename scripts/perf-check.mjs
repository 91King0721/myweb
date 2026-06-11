import { existsSync, readFileSync } from 'node:fs';

const files = {
  index: readFileSync('index.html', 'utf8'),
  query: readFileSync('query.html', 'utf8'),
  app: readFileSync('assets/js/app.js', 'utf8'),
  transitions: readFileSync('assets/js/transitions.js', 'utf8'),
  css: readFileSync('assets/css/style.css', 'utf8')
};

const checks = [
  {
    name: 'landing page prewarms query page scripts before navigation',
    pass:
      files.index.includes('assets/js/data.js') &&
      files.index.includes('assets/js/app.js') &&
      files.index.includes('as="script"')
  },
  {
    name: 'click transition prewarms target assets before starting page leave',
    pass:
      files.transitions.includes('prewarmNavigationTarget') &&
      files.transitions.includes('Image()')
  },
  {
    name: 'results refresh avoids forced synchronous layout',
    pass: !files.app.includes('offsetWidth')
  },
  {
    name: 'results refresh is scheduled on animation frames',
    pass:
      files.app.includes('requestAnimationFrame') &&
      files.app.includes('scheduleResultsRefresh')
  },
  {
    name: 'collapsed day blocks do not render hidden tables',
    pass:
      files.app.includes('renderDayBody') &&
      files.app.includes('if (isExpanded)')
  },
  {
    name: 'industrial background has lightweight WebP variants',
    pass:
      existsSync('assets/images/industrial-desktop.webp') &&
      existsSync('assets/images/industrial-mobile.webp') &&
      files.css.includes('industrial-desktop.webp') &&
      files.css.includes('industrial-mobile.webp')
  },
  {
    name: 'mobile navigation bypasses heavy page transition',
    pass:
      files.transitions.includes('isCompactViewport') &&
      files.transitions.includes('prefersReducedMotion || isCompactViewport()')
  },
  {
    name: 'mobile styles disable expensive full-screen animation and blur',
    pass:
      files.css.includes('.landing-page .grid-lines') &&
      files.css.includes('backdrop-filter: none') &&
      files.css.includes('-webkit-backdrop-filter: none')
  },
  {
    name: 'mobile controls use compact grid with touch-sized fields',
    pass:
      files.css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))') &&
      files.css.includes('min-height: 44px') &&
      files.css.includes('#searchInput')
  },
  {
    name: 'mobile landing uses stable small viewport height',
    pass:
      files.css.includes('100svh') &&
      files.css.includes('clamp(300px, 44svh, 390px)')
  },
  {
    name: 'mobile render scrolls the expanded day into view',
    pass:
      files.app.includes('scrollExpandedDayIntoView') &&
      files.app.includes('data-day') &&
      files.app.includes('scrollToExpanded')
  }
];

const failed = checks.filter((check) => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
