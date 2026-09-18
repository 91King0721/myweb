import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync('assets/js/theme.js', 'utf8');
const key = 'classroom-theme-choice-v1';
function page(store = new Map(), url = 'https://655512.xyz/query.html', blocked = false) {
  const events = {}, inputEvents = {}, windowEvents = {};
  const link = { href: 'index.html?theme=retro', getAttribute() { return this.href; } };
  const search = { value: '', addEventListener(name, handler) { inputEvents[name] = handler; } };
  const document = {
    documentElement: { dataset: {} },
    querySelector() { return null; },
    querySelectorAll() { return [link]; },
    getElementById(id) { return id === 'searchInput' ? search : null; },
    addEventListener(name, handler) { events[name] = handler; }
  };
  const location = { href: url, search: new URL(url).search };
  const context = {
    document, location, URL, URLSearchParams,
    history: { state: null, replaceState(_, __, value) { location.href = value; } },
    localStorage: {
      getItem(k) { if (blocked) throw Error('unavailable'); return store.get(k) ?? null; },
      setItem(k, value) { if (blocked) throw Error('unavailable'); store.set(k, value); }
    },
    matchMedia: () => ({ matches: true }),
    window: { addEventListener(name, handler) { windowEvents[name] = handler; }, render() {} }
  };
  vm.runInNewContext(code, context);
  events.DOMContentLoaded();
  return {
    theme: () => document.documentElement.dataset.theme,
    command(value, isComposing = false) { search.value = value; inputEvents.input({ isComposing }); },
    search, link, location, inputEvents, windowEvents
  };
}
for (const previous of [null, 'retro', 'modern', 'glass']) {
  const store = new Map(previous ? [['classroom-style-preview', previous]] : []);
  const tab = page(store, 'https://655512.xyz/query.html?theme=retro');
  assert.equal(tab.theme(), 'glass', 'new and returning visitors start in glass');
  assert.equal(store.has(key), false, 'initial visits must not save a user choice');
  assert.equal(new URL(tab.link.href).searchParams.has('theme'), false);
  assert.equal(new URL(tab.location.href).searchParams.has('theme'), false);
  for (const theme of ['retro', 'modern', 'glass']) {
    tab.command('sw');
    assert.equal(tab.theme(), theme);
    assert.equal(tab.search.value, '');
    assert.equal(store.get(key), theme);
    assert.equal(page(store, 'https://655512.xyz/index.html?theme=retro').theme(), theme);
  }
  tab.command('201');
  assert.equal(tab.search.value, '201');
  assert.equal(tab.theme(), 'glass');
  tab.command('sw', true);
  assert.equal(tab.theme(), 'glass');
  tab.inputEvents.compositionend();
  assert.equal(tab.theme(), 'retro');
  tab.command(''); // final input event after composition must not switch twice
  assert.equal(tab.theme(), 'retro');
  store.set(key, 'modern');
  tab.windowEvents.pageshow({ persisted: true });
  assert.equal(tab.theme(), 'modern', 'back cache restores latest local choice');
}
const blocked = page(new Map(), undefined, true);
assert.equal(blocked.theme(), 'glass');
blocked.command('sw');
assert.equal(blocked.theme(), 'retro');
assert.equal(page(new Map([[key, 'invalid']])).theme(), 'glass');
assert.equal(page().theme(), 'glass', 'another browser never inherits this browser choice');
for (const file of ['index.html', 'query.html']) {
  const html = readFileSync(file, 'utf8');
  assert.ok(html.includes('data-theme="glass"'));
  assert.ok(!html.includes('class="theme-toggle"'));
}
console.log('PASS: fresh/returning visitors, legacy URLs, explicit-only persistence, three-theme cycle, normal search, IME, bfcache, isolated browser and unavailable storage');
