import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = {
  index: readFileSync('index.html', 'utf8'),
  page: readFileSync('vocabulary.html', 'utf8'),
  wrongPage: readFileSync('wrong-book.html', 'utf8'),
  favoritePage: readFileSync('favorites.html', 'utf8'),
  app: readFileSync('assets/js/vocabulary-app.js', 'utf8'),
  library: readFileSync('assets/js/vocabulary-library.js', 'utf8'),
  data: readFileSync('assets/js/vocabulary-data.js', 'utf8'),
  css: readFileSync('assets/css/style.css', 'utf8')
};

const context = { window: {} };
vm.runInNewContext(files.data, context);
const lists = context.window.VOCABULARY_LISTS;
const entries = lists.flatMap((list) => list.entries);

const checks = [
  {
    name: 'vocabulary source contains all 61 lists',
    pass: lists.length === 61 && lists.every((list, index) => list.list === index + 1)
  },
  {
    name: 'PDF extraction contains the complete 1826-entry dataset',
    pass: entries.length === 1826
  },
  {
    name: 'every vocabulary entry has a stable id, word, accepted spellings, and meaning',
    pass: entries.every((entry) =>
      entry.id &&
      entry.word &&
      Array.isArray(entry.accepted) &&
      entry.accepted.length > 0 &&
      entry.meaning
    )
  },
  {
    name: 'known PDF spelling differences accept both variants',
    pass:
      lists[3].entries.find((entry) => entry.id === 'L4-21')?.accepted.includes('practise') &&
      lists[3].entries.find((entry) => entry.id === 'L4-21')?.accepted.includes('practice') &&
      lists[18].entries.find((entry) => entry.id === 'L19-5')?.accepted.includes('emphasize') &&
      lists[18].entries.find((entry) => entry.id === 'L19-5')?.accepted.includes('emphasise')
  },
  {
    name: 'the vocabulary page loads data and application scripts',
    pass:
      files.page.includes('assets/js/vocabulary-data.js') &&
      files.page.includes('assets/js/vocabulary-app.js')
  },
  {
    name: 'the landing page keeps classroom access and adds vocabulary access',
    pass:
      files.index.includes('href="query.html"') &&
      files.index.includes('href="vocabulary.html"')
  },
  {
    name: 'choice, typing, wrong-book, and favorite controls are present',
    pass:
      files.page.includes('data-mode="choice"') &&
      files.page.includes('data-mode="typing"') &&
      files.page.includes('data-scope="wrong"') &&
      files.page.includes('data-scope="favorite"')
  },
  {
    name: 'wrong-book and favorites have prominent independent module entries',
    pass:
      files.page.includes('href="wrong-book.html"') &&
      files.page.includes('href="favorites.html"') &&
      files.page.includes('vocab-library-launchers')
  },
  {
    name: 'wrong-book and favorites are separate browsing pages',
    pass:
      files.wrongPage.includes('data-library="wrong"') &&
      files.favoritePage.includes('data-library="favorite"') &&
      files.wrongPage.includes('assets/js/vocabulary-library.js') &&
      files.favoritePage.includes('assets/js/vocabulary-library.js')
  },
  {
    name: 'collection pages support search, list filter, speech, removal, undo, and focused testing',
    pass:
      files.library.includes('collectionSearch') &&
      files.library.includes('collectionListFilter') &&
      files.library.includes('SpeechSynthesisUtterance') &&
      files.library.includes('removeEntry') &&
      files.library.includes('undoRemoval') &&
      files.wrongPage.includes('vocabulary.html?scope=wrong') &&
      files.favoritePage.includes('vocabulary.html?scope=favorite') &&
      files.app.includes('URLSearchParams')
  },
  {
    name: 'favorites, wrong words, and preferences persist locally',
    pass:
      files.app.includes('vocabularyFavoritesV1') &&
      files.app.includes('vocabularyWrongWordsV1') &&
      files.app.includes('vocabularyPreferencesV1') &&
      files.app.includes('localStorage')
  },
  {
    name: 'compact session recovery is capped and stored separately',
    pass:
      files.app.includes("session: 'vocabularySessionV1'") &&
      files.app.includes('MAX_SESSION_CHARS = 48000') &&
      files.app.includes('MAX_STORED_ANSWERS = 800') &&
      files.app.includes('restoreSession') &&
      files.app.includes("window.addEventListener('pagehide', saveSession)")
  },
  {
    name: 'version upgrades never clear existing browser data',
    pass:
      !files.app.includes('localStorage.clear') &&
      !files.app.includes('removeItem(') &&
      !files.library.includes('localStorage.clear') &&
      !files.library.includes('removeItem(')
  },
  {
    name: 'wrong-book supports JSON export and merge import',
    pass:
      files.wrongPage.includes('id="wrongExportButton"') &&
      files.wrongPage.includes('id="wrongImportButton"') &&
      files.wrongPage.includes('id="wrongImportInput"') &&
      files.library.includes("EXPORT_SCHEMA = 'vocabulary-wrong-book'") &&
      files.library.includes('exportWrongWords') &&
      files.library.includes('importWrongWords') &&
      files.library.includes('mergeWrongRecord')
  },
  {
    name: 'wrong-book sorts counts, groups frequencies, and limits List options to wrong entries',
    pass:
      files.library.includes('getWrongCount(right) - getWrongCount(left)') &&
      files.library.includes("count >= 3") &&
      files.library.includes("count === 2") &&
      files.library.includes("key: 'low'") &&
      files.library.includes('new Set(entries.map') &&
      files.wrongPage.includes('id="wrongFrequencySummary"')
  },
  {
    name: 'wrong-book focused testing supports all wrong words or one populated List',
    pass:
      files.app.includes('wrongListNumber') &&
      files.app.includes('getWrongListNumbers') &&
      files.app.includes("'全部错题 · '") &&
      files.app.includes("' 个错词'") &&
      files.app.includes("state.scope === 'favorite'") &&
      files.app.includes("WRONG_BOOK · LIST ")
  },
  {
    name: 'browser speech synthesis is wired to the word reader',
    pass:
      files.app.includes('SpeechSynthesisUtterance') &&
      files.app.includes('speechSynthesis.speak')
  },
  {
    name: 'responsive rules cover desktop, tablet, and phone layouts',
    pass:
      files.css.includes('@media (max-width: 1100px)') &&
      files.css.includes('@media (max-width: 900px)') &&
      files.css.includes('@media (max-width: 600px)') &&
      files.css.includes('.vocabulary-shell') &&
      files.css.includes('.vocab-library-modules') &&
      files.css.includes('.vocab-library-item')
  }
];

const failed = checks.filter((check) => !check.pass);

for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
