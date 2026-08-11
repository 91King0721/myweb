import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const memory = new Map();
const localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  }
};
const context = { window: {}, localStorage, Date, console };
vm.runInNewContext(
  readFileSync('assets/js/vocabulary-learning-core.js', 'utf8'),
  context
);

const learning = context.window.VocabularyLearning;
const start = new Date(2026, 7, 11, 9, 0, 0).getTime();
const nextDay = new Date(2026, 7, 12, 0, 0, 0).getTime();
const progress = {};
const daily = {};

function check(name, pass) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) process.exitCode = 1;
}

const first = learning.recordAnswer(progress, daily, 'L1-1', true, start);
check(
  'first correct answer schedules a next-day review',
  first.stage === 1 && first.nextReviewAt === nextDay
);

const secondAt = nextDay;
const second = learning.recordAnswer(progress, daily, 'L1-1', true, secondAt);
const twoDaysLater = new Date(2026, 7, 14, 0, 0, 0).getTime();
check(
  'second correct answer advances to a two-day interval',
  second.stage === 2 && second.nextReviewAt === twoDaysLater && second.reviewAttempts === 1
);

const lapseAt = twoDaysLater;
const lapse = learning.recordAnswer(progress, daily, 'L1-1', false, lapseAt);
const lapseReviewDate = new Date(2026, 7, 15, 0, 0, 0).getTime();
check(
  'a learned word answered incorrectly resets to next day and records a lapse',
  lapse.stage === 0 && lapse.nextReviewAt === lapseReviewDate && lapse.lapses === 1
);

const entry = { id: 'L1-1' };
check(
  'due review only appears when its timestamp is reached',
  learning.getDueEntries([entry], progress, lapseAt).length === 0 &&
    learning.getDueEntries([entry], progress, lapseReviewDate).length === 1
);

const stats = learning.getTodayStats(daily, lapseAt);
check(
  'daily statistics count answers, correctness, and reviews',
  stats.answered >= 1 && stats.wrong >= 1 && stats.reviewed >= 1
);

check(
  'forgetting rate is based on lapses among review attempts',
  learning.getForgettingRate(progress) === 50
);

const seeded = learning.seedFromWrongWords(
  {},
  { 'L2-1': { count: 4, lastWrongAt: new Date(start).toISOString() } },
  new Set(['L2-1']),
  start
);
check(
  'existing wrong-book data seeds a due learning record without deleting it',
  learning.getRecord(seeded, 'L2-1').wrong === 4 &&
    learning.getDueEntries([{ id: 'L2-1' }], seeded, start).length === 1
);

check(
  'daily storage stays compact and limited',
  learning.getDailySeries(daily, 7, lapseAt).length === 7 &&
    memory.has(learning.STORAGE_KEYS.progress) &&
    memory.has(learning.STORAGE_KEYS.daily)
);
