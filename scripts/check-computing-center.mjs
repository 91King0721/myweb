import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync('assets/js/data.js', 'utf8'), context);
const { DATA, DATA_META } = context;
const building = '计网中心';
assert.equal(DATA_META.buildings.filter(name => name === building).length, 1);
const room = (week, day, number) => DATA[week][building][day].rooms.find(r => r.name === `${building}-${number}`);
for (let week = 1; week <= 18; week++) {
  for (const dayName of DATA_META.dayNames) {
    const day = DATA[week][building][dayName];
    assert.equal(day.total, 7);
    assert.equal(new Set(day.rooms.map(r => r.name)).size, 7);
    assert.equal(day.free, day.rooms.filter(r => r.periods.every(p => p === 0)).length);
    assert.equal(day.isoDate, DATA[week]['一教'][dayName].isoDate);
    for (const r of day.rooms) {
      assert.equal(r.seats, '—');
      assert.equal(r.periods.length, 12);
      assert(r.periods.every(p => p === 0 || p === 1));
      for (let p = 0; p < 12; p += 2) assert.equal(r.periods[p], r.periods[p + 1]);
    }
  }
}
// Excel G4/G5: database course runs weeks 1–10, 12, 14–16.
for (let week = 1; week <= 18; week++) {
  assert.equal(room(week, '周六', '301').periods[0], week <= 10 || week === 12 || (week >= 14 && week <= 16) ? 1 : 0);
}
// Excel H4/H5: explicitly listed weeks, including the even week 12.
for (let week = 1; week <= 18; week++) {
  assert.equal(room(week, '周日', '209').periods[0], [1, 3, 5, 7, 9, 12].includes(week) ? 1 : 0);
}
// Excel F4/F5: room 309 has class in weeks 1–17, only the first two blocks.
assert.equal(room(17, '周五', '309').periods.join(''), '111100000000');
assert.equal(room(18, '周五', '309').periods.join(''), '000000000000');
// Excel D6/D7: operating systems runs on alternate even weeks.
assert.equal(room(1, '周三', '203').periods[4], 0);
assert.equal(room(2, '周三', '203').periods[4], 1);
assert.equal(room(16, '周三', '203').periods[7], 1);
assert.equal(room(17, '周三', '203').periods[7], 0);

// Exercise the real render/filter code with minimal DOM elements.
const elements = Object.fromEntries(Object.entries({
  weekSel: '1', bldSel: building, searchInput: '', periodSel: 'all',
  periodStart: '1', periodEnd: '4', results: '',
}).map(([id, value]) => [id, { value, innerHTML: '' }]));
context.document = { getElementById: id => elements[id] };
context.localStorage = { getItem: () => '[]' };
context.window = { matchMedia: () => ({ matches: true }) };
vm.runInContext(readFileSync('assets/js/app.js', 'utf8').replace(/init\(\);\s*$/, ''), context);
context.expandedDay = '周五';
context.render();
assert(elements.results.innerHTML.includes('计网中心-309'));
elements.periodSel.value = '1-4';
context.render();
assert(!elements.results.innerHTML.includes('计网中心-309'));
elements.periodSel.value = 'custom';
elements.periodStart.value = '5';
elements.periodEnd.value = '8';
context.render();
assert(elements.results.innerHTML.includes('计网中心-309'));
elements.searchInput.value = '309';
context.render();
assert(elements.results.innerHTML.includes('计网中心-309'));
assert(!elements.results.innerHTML.includes('计网中心-201'));
context.showFavsOnly = true;
context.localStorage.getItem = () => '["计网中心|计网中心-309"]';
context.render();
assert(elements.results.innerHTML.includes('计网中心-309'));
context.showFavsOnly = false;
elements.bldSel.value = '一教';
elements.searchInput.value = '';
elements.periodSel.value = 'all';
context.expandedDay = '周一';
context.render();
assert(!elements.results.innerHTML.includes('一教-209'));
assert(elements.results.innerHTML.includes('一教-305'));
console.log('PASS: all 18 weeks, disjoint weeks, boundaries, capacity, search, favorites and period filters');
