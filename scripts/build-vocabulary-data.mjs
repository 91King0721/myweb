import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , selfTestPath, answerPath, outputPath] = process.argv;

if (!selfTestPath || !answerPath) {
  console.error(
    'Usage: node scripts/build-vocabulary-data.mjs <self-test-raw.txt> <answers-raw.txt> [output.js]'
  );
  process.exit(1);
}

const HEADING_PATTERN = /30 个高频词(?:汇)?\s+List(\d+)/g;
const HEADER_PATTERN = /^编码\s+单词\s+释义$/;
const PAGE_NUMBER_PATTERN = /^\d+$/;
const CANONICAL_WORD_OVERRIDES = new Map([
  ['L4-21', 'practice'],
  ['L19-5', 'emphasize']
]);

function getListBlocks(text) {
  const headings = [...text.matchAll(HEADING_PATTERN)];
  const blocks = new Map();

  headings.forEach((heading, index) => {
    const listNumber = Number(heading[1]);
    const start = heading.index + heading[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
    blocks.set(listNumber, text.slice(start, end));
  });

  return blocks;
}

function cleanLine(line) {
  return line.replaceAll('\f', '').trim();
}

function parseSelfTest(text) {
  const blocks = getListBlocks(text);
  const lists = [];

  for (let listNumber = 1; listNumber <= 61; listNumber += 1) {
    const block = blocks.get(listNumber);
    if (!block) throw new Error(`Self-test List ${listNumber} is missing`);

    const words = [];
    for (const originalLine of block.split(/\r?\n/)) {
      const line = cleanLine(originalLine);
      if (!line || HEADER_PATTERN.test(line) || PAGE_NUMBER_PATTERN.test(line)) continue;

      const match = line.match(/^(\d+)\s+(\S+)$/);
      if (!match) continue;

      words.push({
        index: Number(match[1]),
        word: match[2]
      });
    }

    lists.push({ list: listNumber, words });
  }

  return lists;
}

function parseAnswers(text) {
  const blocks = getListBlocks(text);
  const lists = new Map();

  for (let listNumber = 1; listNumber <= 61; listNumber += 1) {
    const block = blocks.get(listNumber);
    if (!block) throw new Error(`Answer List ${listNumber} is missing`);

    const entries = [];
    let currentEntry = null;

    for (const originalLine of block.split(/\r?\n/)) {
      const line = cleanLine(originalLine);
      if (!line || HEADER_PATTERN.test(line) || PAGE_NUMBER_PATTERN.test(line)) continue;

      const entryMatch = line.match(/^(\d+)\s+(\S+)(?:\s+(.+))?$/);
      if (entryMatch) {
        currentEntry = {
          index: Number(entryMatch[1]),
          word: entryMatch[2],
          meaning: entryMatch[3] || ''
        };
        entries.push(currentEntry);
        continue;
      }

      if (currentEntry) {
        currentEntry.meaning = `${currentEntry.meaning} ${line}`.trim();
      }
    }

    lists.set(listNumber, entries);
  }

  return lists;
}

function normalizeMeaning(meaning) {
  return meaning
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。；：、])/g, '$1')
    .replace(/(?<=[\u3400-\u9fff）】])\s+(?=[\u3400-\u9fff（【])/g, '')
    .replace(/(?<=[，。；：、])\s+(?=[\u3400-\u9fff（【])/g, '')
    .trim();
}

const selfTestLists = parseSelfTest(readFileSync(resolve(selfTestPath), 'utf8'));
const answerLists = parseAnswers(readFileSync(resolve(answerPath), 'utf8'));
const wordMismatches = [];
const data = selfTestLists.map(({ list, words }) => {
  const answers = answerLists.get(list);

  if (words.length !== answers.length) {
    throw new Error(
      `List ${list} count mismatch: self-test=${words.length}, answers=${answers.length}`
    );
  }

  const answerByIndex = new Map(answers.map((entry) => [entry.index, entry]));
  const entries = words.map((selfEntry) => {
    const answerEntry = answerByIndex.get(selfEntry.index);
    const id = `L${list}-${selfEntry.index}`;
    if (!answerEntry) {
      throw new Error(`List ${list} item ${selfEntry.index} has no answer`);
    }

    if (answerEntry.word !== selfEntry.word) {
      wordMismatches.push({
        list,
        index: selfEntry.index,
        selfTest: selfEntry.word,
        answer: answerEntry.word
      });
    }

    if (!answerEntry.meaning) {
      throw new Error(`List ${list} item ${selfEntry.index} has no meaning`);
    }

    const word = CANONICAL_WORD_OVERRIDES.get(id) || selfEntry.word;
    const accepted = [...new Set(
      [word, selfEntry.word, answerEntry.word]
        .flatMap((variant) => variant.split('/'))
        .map((variant) => variant.normalize('NFC').toLowerCase())
    )];

    return {
      id,
      index: selfEntry.index,
      word,
      accepted,
      meaning: normalizeMeaning(answerEntry.meaning)
    };
  });

  return { list, entries };
});

const totalWords = data.reduce((sum, currentList) => sum + currentList.entries.length, 0);
const listCounts = data.map(({ list, entries }) => `${list}:${entries.length}`).join(', ');

console.log(`Parsed ${data.length} lists and ${totalWords} words.`);
console.log(`List counts: ${listCounts}`);
console.log(`Word mismatches: ${JSON.stringify(wordMismatches, null, 2)}`);

if (outputPath) {
  const banner = [
    '/**',
    ' * Generated from the supplied 1800-word self-test and answer PDFs.',
    ` * Lists: ${data.length}; entries: ${totalWords}.`,
    ' * Do not edit individual entries by hand; regenerate with scripts/build-vocabulary-data.mjs.',
    ' */'
  ].join('\n');
  const payload = `${banner}\nwindow.VOCABULARY_LISTS = ${JSON.stringify(data, null, 2)};\n`;
  writeFileSync(resolve(outputPath), payload, 'utf8');
  console.log(`Wrote ${resolve(outputPath)}`);
}
