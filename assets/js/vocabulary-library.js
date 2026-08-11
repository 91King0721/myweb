/**
 * 独立词库模块
 * - 错题本 / 单词收藏分别查看
 * - 搜索、动态 List 筛选、朗读、移除与撤销
 * - 错题次数分级、排序、导出与合并导入
 * - 全部错题或多个 List 错题混合乱序测试
 * - 与测试页共享 localStorage 数据，兼容 v0.4 已有记录
 */
(function () {
  'use strict';

  var lists = Array.isArray(window.VOCABULARY_LISTS) ? window.VOCABULARY_LISTS : [];
  var libraryType = document.body.getAttribute('data-library') === 'favorite'
    ? 'favorite'
    : 'wrong';
  var STORAGE_KEYS = {
    favorites: 'vocabularyFavoritesV1',
    wrong: 'vocabularyWrongWordsV1'
  };
  var EXPORT_SCHEMA = 'vocabulary-wrong-book';
  var EXPORT_VERSION = 1;
  var entryById = new Map();
  var allEntries = [];
  var favorites = new Set();
  var wrongWords = {};
  var refs = {};
  var lastRemoval = null;
  var noticeTimer = 0;

  lists.forEach(function (list) {
    list.entries.forEach(function (entry) {
      var enriched = Object.assign({ list: list.list }, entry);
      entryById.set(enriched.id, enriched);
      allEntries.push(enriched);
    });
  });

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function cleanTimestamp(value) {
    if (typeof value !== 'string') return '';
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  function normalizeWrongRecord(record) {
    var source = record && typeof record === 'object'
      ? record
      : { count: record };
    var count = Math.max(0, Math.floor(Number(source.count) || 0));
    var normalized = { count: count };
    var lastWrongAt = cleanTimestamp(source.lastWrongAt);
    var addedManuallyAt = cleanTimestamp(source.addedManuallyAt);

    if (lastWrongAt) normalized.lastWrongAt = lastWrongAt;
    if (addedManuallyAt) normalized.addedManuallyAt = addedManuallyAt;
    return normalized;
  }

  function loadCollections() {
    var storedFavorites = safeParse(localStorage.getItem(STORAGE_KEYS.favorites), []);
    var storedWrong = safeParse(localStorage.getItem(STORAGE_KEYS.wrong), {});

    favorites = new Set(
      Array.isArray(storedFavorites)
        ? storedFavorites.filter(function (id) { return entryById.has(id); })
        : []
    );

    wrongWords = {};
    if (storedWrong && !Array.isArray(storedWrong) && typeof storedWrong === 'object') {
      Object.keys(storedWrong).forEach(function (id) {
        if (entryById.has(id)) wrongWords[id] = normalizeWrongRecord(storedWrong[id]);
      });
    }
  }

  function saveCollections() {
    try {
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(Array.from(favorites)));
      localStorage.setItem(STORAGE_KEYS.wrong, JSON.stringify(wrongWords));
    } catch (error) {
      // Browsing and testing remain usable when local storage is blocked.
    }
  }

  function cacheRefs() {
    [
      'wrongModuleCount',
      'favoriteModuleCount',
      'collectionTotal',
      'collectionVisibleCount',
      'collectionSearch',
      'collectionListFilter',
      'collectionList',
      'collectionEmpty',
      'collectionEmptyTitle',
      'collectionEmptyDescription',
      'collectionTestLink',
      'wrongShufflePanel',
      'wrongShuffleAllLink',
      'wrongShuffleAllCount',
      'wrongShuffleListOptions',
      'wrongShuffleSelectionSummary',
      'wrongShuffleSelectedButton',
      'wrongShuffleSelectAll',
      'wrongShuffleClear',
      'libraryNotice',
      'libraryNoticeText',
      'libraryUndoButton',
      'wrongDataActions',
      'wrongExportButton',
      'wrongImportButton',
      'wrongImportInput',
      'wrongFrequencySummary',
      'wrongHighCount',
      'wrongMediumCount',
      'wrongLowCount'
    ].forEach(function (id) {
      refs[id] = document.getElementById(id);
    });
  }

  function getWrongCount(entry) {
    return Number((wrongWords[entry.id] || {}).count || 0);
  }

  function getWrongTime(entry) {
    var record = wrongWords[entry.id] || {};
    var date = new Date(record.lastWrongAt || record.addedManuallyAt || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function getFrequency(count) {
    if (count >= 3) {
      return { key: 'high', label: '高频错题', code: 'HIGH_FREQUENCY' };
    }
    if (count === 2) {
      return { key: 'medium', label: '中频错题', code: 'MEDIUM_FREQUENCY' };
    }
    return { key: 'low', label: '低频错题', code: 'LOW_FREQUENCY' };
  }

  function getCollectionEntries() {
    if (libraryType === 'favorite') {
      return allEntries.filter(function (entry) {
        return favorites.has(entry.id);
      });
    }

    return allEntries.filter(function (entry) {
      return Boolean(wrongWords[entry.id]);
    }).sort(function (left, right) {
      return getWrongCount(right) - getWrongCount(left) ||
        getWrongTime(right) - getWrongTime(left) ||
        left.list - right.list ||
        left.index - right.index;
    });
  }

  function getWrongListGroups(entries) {
    var groups = new Map();

    entries.forEach(function (entry) {
      groups.set(entry.list, (groups.get(entry.list) || 0) + 1);
    });

    return Array.from(groups.entries()).sort(function (left, right) {
      return left[0] - right[0];
    });
  }

  function getSelectedWrongShuffleLists() {
    if (!refs.wrongShuffleListOptions) return [];

    return Array.prototype.map.call(
      refs.wrongShuffleListOptions.querySelectorAll('input:checked'),
      function (input) { return Number(input.value); }
    ).filter(function (listNumber) {
      return Number.isInteger(listNumber);
    }).sort(function (left, right) {
      return left - right;
    });
  }

  function createWrongShuffleHref(listValue) {
    var roundId = Date.now().toString(36) +
      Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
    return 'vocabulary.html?scope=wrong&shuffle=1&wrongLists=' +
      String(listValue) + '&round=' + roundId;
  }

  function updateWrongShuffleSelectionSummary() {
    if (!refs.wrongShuffleListOptions) return;

    var checked = refs.wrongShuffleListOptions.querySelectorAll('input:checked');
    var selectedWords = Array.prototype.reduce.call(checked, function (total, input) {
      return total + Math.max(0, Number(input.dataset.count) || 0);
    }, 0);
    var selectedLists = getSelectedWrongShuffleLists();
    var hasSelection = selectedLists.length > 0;

    refs.wrongShuffleSelectionSummary.textContent = hasSelection
      ? '已选 ' + selectedLists.length + ' 个 List · 共 ' + selectedWords + ' 个错词'
      : '请选择至少一个 List';
    refs.wrongShuffleSelectedButton.disabled = !hasSelection;
    refs.wrongShuffleSelectedButton.dataset.href = hasSelection
      ? createWrongShuffleHref(selectedLists.join(','))
      : '';
  }

  function renderWrongShuffleControls(entries) {
    if (libraryType !== 'wrong' || !refs.wrongShufflePanel) return;

    var selected = new Set(getSelectedWrongShuffleLists());
    var groups = getWrongListGroups(entries);
    var fragment = document.createDocumentFragment();
    var hasEntries = entries.length > 0;

    groups.forEach(function (group) {
      var listNumber = group[0];
      var count = group[1];
      var label = document.createElement('label');
      var input = document.createElement('input');
      var listName = document.createElement('span');
      var wordCount = document.createElement('b');

      label.className = 'vocab-wrong-shuffle-list';
      input.type = 'checkbox';
      input.value = String(listNumber);
      input.dataset.count = String(count);
      input.checked = selected.has(listNumber);
      input.addEventListener('change', updateWrongShuffleSelectionSummary);
      listName.textContent = 'List ' + String(listNumber).padStart(2, '0');
      wordCount.textContent = count + ' 词';
      label.appendChild(input);
      label.appendChild(listName);
      label.appendChild(wordCount);
      fragment.appendChild(label);
    });

    refs.wrongShuffleListOptions.replaceChildren(fragment);
    refs.wrongShuffleAllCount.textContent = String(entries.length);
    refs.wrongShuffleAllLink.href = createWrongShuffleHref('all');
    refs.wrongShuffleAllLink.classList.toggle('is-disabled', !hasEntries);
    refs.wrongShuffleAllLink.setAttribute('aria-disabled', String(!hasEntries));
    refs.wrongShuffleSelectAll.disabled = !hasEntries;
    refs.wrongShuffleClear.disabled = !hasEntries;

    if (!hasEntries) {
      refs.wrongShuffleListOptions.innerHTML =
        '<p class="vocab-wrong-shuffle-empty">暂无错题，完成测试后这里会自动出现可选 List。</p>';
    }
    updateWrongShuffleSelectionSummary();
  }

  function setWrongShuffleLists(checked) {
    if (!refs.wrongShuffleListOptions) return;

    Array.prototype.forEach.call(
      refs.wrongShuffleListOptions.querySelectorAll('input[type="checkbox"]'),
      function (input) { input.checked = checked; }
    );
    updateWrongShuffleSelectionSummary();
  }

  function populateListFilter(entries) {
    var selected = refs.collectionListFilter.value || 'all';
    var listNumbers = libraryType === 'wrong'
      ? Array.from(new Set(entries.map(function (entry) { return entry.list; })))
      : lists.map(function (list) { return list.list; });
    var fragment = document.createDocumentFragment();
    var allOption = document.createElement('option');

    listNumbers.sort(function (left, right) { return left - right; });
    allOption.value = 'all';
    allOption.textContent = '全部 List';
    fragment.appendChild(allOption);

    listNumbers.forEach(function (listNumber) {
      var option = document.createElement('option');
      option.value = String(listNumber);
      option.textContent = 'List ' + listNumber;
      fragment.appendChild(option);
    });

    refs.collectionListFilter.replaceChildren(fragment);
    refs.collectionListFilter.value = listNumbers.indexOf(Number(selected)) !== -1
      ? selected
      : 'all';
  }

  function normalizeSearch(value) {
    return value.trim().toLocaleLowerCase('zh-CN');
  }

  function getVisibleEntries(entries) {
    var query = normalizeSearch(refs.collectionSearch.value);
    var selectedList = refs.collectionListFilter.value;

    return entries.filter(function (entry) {
      var matchesList = selectedList === 'all' || String(entry.list) === selectedList;
      var searchable = (entry.word + ' ' + entry.meaning).toLocaleLowerCase('zh-CN');
      return matchesList && (!query || searchable.indexOf(query) !== -1);
    });
  }

  function formatWrongMeta(entry) {
    var record = wrongWords[entry.id] || {};
    var count = Number(record.count || 0);
    var label = count > 0 ? '累计答错 ' + count + ' 次' : '手动加入';

    if (!record.lastWrongAt) return label;

    var date = new Date(record.lastWrongAt);
    if (Number.isNaN(date.getTime())) return label;
    return label + ' · 最近 ' + date.toLocaleDateString('zh-CN');
  }

  function makeSpeechButton(entry) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'vocab-library-item-action vocab-library-speak';
    button.setAttribute('aria-label', '朗读 ' + entry.word);
    button.title = '朗读单词';
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>' +
        '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>' +
        '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>' +
      '</svg><span>朗读</span>';
    button.addEventListener('click', function () {
      speakWord(entry, button);
    });
    return button;
  }

  function makeRemoveButton(entry) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'vocab-library-item-action vocab-library-remove';
    button.textContent = libraryType === 'favorite' ? '取消收藏' : '移出错题本';
    button.addEventListener('click', function () {
      removeEntry(entry);
    });
    return button;
  }

  function renderEntry(entry, index) {
    var article = document.createElement('article');
    var sequence = document.createElement('span');
    var copy = document.createElement('div');
    var wordRow = document.createElement('div');
    var word = document.createElement('h3');
    var source = document.createElement('span');
    var meaning = document.createElement('p');
    var footer = document.createElement('div');
    var metaRow = document.createElement('div');
    var meta = document.createElement('span');
    var actions = document.createElement('div');

    article.className = 'vocab-library-item';
    article.dataset.entryId = entry.id;
    sequence.className = 'vocab-library-item-index';
    sequence.textContent = String(index + 1).padStart(2, '0');
    copy.className = 'vocab-library-item-copy';
    wordRow.className = 'vocab-library-item-word';
    word.textContent = entry.word;
    word.lang = 'en';
    source.textContent =
      'LIST ' + String(entry.list).padStart(2, '0') +
      ' · #' + String(entry.index).padStart(2, '0');
    meaning.className = 'vocab-library-item-meaning';
    meaning.textContent = entry.meaning;
    footer.className = 'vocab-library-item-footer';
    metaRow.className = 'vocab-library-item-meta-row';
    meta.className = 'vocab-library-item-meta';
    meta.textContent = libraryType === 'wrong' ? formatWrongMeta(entry) : '已收藏 · 本设备保存';
    actions.className = 'vocab-library-item-actions';

    if (libraryType === 'wrong') {
      var frequency = getFrequency(getWrongCount(entry));
      var badge = document.createElement('span');
      article.classList.add('is-' + frequency.key + '-frequency');
      article.dataset.frequency = frequency.key;
      badge.className = 'vocab-frequency-badge is-' + frequency.key;
      badge.textContent = frequency.label;
      metaRow.appendChild(badge);
    }

    wordRow.appendChild(word);
    wordRow.appendChild(source);
    metaRow.appendChild(meta);
    actions.appendChild(makeSpeechButton(entry));
    actions.appendChild(makeRemoveButton(entry));
    footer.appendChild(metaRow);
    footer.appendChild(actions);
    copy.appendChild(wordRow);
    copy.appendChild(meaning);
    copy.appendChild(footer);
    article.appendChild(sequence);
    article.appendChild(copy);
    return article;
  }

  function makeFrequencyGroup(frequency, entries, startIndex) {
    var section = document.createElement('section');
    var header = document.createElement('header');
    var title = document.createElement('div');
    var list = document.createElement('div');

    section.className = 'vocab-frequency-group is-' + frequency.key;
    section.dataset.frequency = frequency.key;
    header.className = 'vocab-frequency-group-header';
    title.innerHTML =
      '<span>' + frequency.code + '</span>' +
      '<h3>' + frequency.label + '</h3>';
    header.appendChild(title);
    header.insertAdjacentHTML('beforeend', '<b>' + entries.length + ' 个词</b>');
    list.className = 'vocab-frequency-group-list';

    entries.forEach(function (entry, index) {
      list.appendChild(renderEntry(entry, startIndex + index));
    });

    section.appendChild(header);
    section.appendChild(list);
    return section;
  }

  function renderEntries(entries) {
    var fragment = document.createDocumentFragment();

    if (libraryType !== 'wrong') {
      entries.forEach(function (entry, index) {
        fragment.appendChild(renderEntry(entry, index));
      });
      refs.collectionList.replaceChildren(fragment);
      return;
    }

    var frequencies = [
      getFrequency(3),
      getFrequency(2),
      getFrequency(1)
    ];
    var startIndex = 0;

    frequencies.forEach(function (frequency) {
      var groupEntries = entries.filter(function (entry) {
        return getFrequency(getWrongCount(entry)).key === frequency.key;
      });
      if (!groupEntries.length) return;
      fragment.appendChild(makeFrequencyGroup(frequency, groupEntries, startIndex));
      startIndex += groupEntries.length;
    });

    refs.collectionList.replaceChildren(fragment);
  }

  function updateFrequencySummary(entries) {
    if (!refs.wrongFrequencySummary) return;
    var counts = { high: 0, medium: 0, low: 0 };

    entries.forEach(function (entry) {
      counts[getFrequency(getWrongCount(entry)).key] += 1;
    });

    refs.wrongHighCount.textContent = String(counts.high);
    refs.wrongMediumCount.textContent = String(counts.medium);
    refs.wrongLowCount.textContent = String(counts.low);
  }

  function updateEmptyState(total, visible) {
    if (visible > 0) {
      refs.collectionEmpty.hidden = true;
      refs.collectionList.hidden = false;
      return;
    }

    refs.collectionList.hidden = true;
    refs.collectionEmpty.hidden = false;

    if (total > 0) {
      refs.collectionEmptyTitle.textContent = '没有匹配的单词';
      refs.collectionEmptyDescription.textContent = '换一个关键词或 List 筛选条件试试。';
      return;
    }

    if (libraryType === 'favorite') {
      refs.collectionEmptyTitle.textContent = '还没有收藏单词';
      refs.collectionEmptyDescription.textContent =
        '在测试页点击单词旁边的星标，即可保存到这个独立模块。';
    } else {
      refs.collectionEmptyTitle.textContent = '错题本还是空的';
      refs.collectionEmptyDescription.textContent =
        '答错的单词会自动加入这里，也可以导入另一台设备的错题。';
    }
  }

  function render() {
    var entries = getCollectionEntries();
    var wrongCount = Object.keys(wrongWords).length;

    populateListFilter(entries);
    var visibleEntries = getVisibleEntries(entries);

    refs.wrongModuleCount.textContent = String(wrongCount);
    refs.favoriteModuleCount.textContent = String(favorites.size);
    refs.collectionTotal.textContent = String(entries.length);
    refs.collectionVisibleCount.textContent = String(visibleEntries.length);
    refs.collectionTestLink.classList.toggle('is-disabled', entries.length === 0);
    refs.collectionTestLink.setAttribute('aria-disabled', String(entries.length === 0));
    if (refs.wrongExportButton) refs.wrongExportButton.disabled = entries.length === 0;

    updateFrequencySummary(entries);
    renderWrongShuffleControls(entries);
    renderEntries(visibleEntries);
    updateEmptyState(entries.length, visibleEntries.length);
  }

  function showNotice(message, canUndo) {
    window.clearTimeout(noticeTimer);
    refs.libraryNotice.hidden = false;
    refs.libraryNoticeText.textContent = message;
    refs.libraryUndoButton.hidden = !canUndo;
    noticeTimer = window.setTimeout(function () {
      refs.libraryNotice.hidden = true;
      if (!canUndo) lastRemoval = null;
    }, canUndo ? 6000 : 5000);
  }

  function removeEntry(entry) {
    if (libraryType === 'favorite') {
      if (!favorites.has(entry.id)) return;
      lastRemoval = { type: 'favorite', id: entry.id };
      favorites.delete(entry.id);
    } else {
      if (!wrongWords[entry.id]) return;
      lastRemoval = {
        type: 'wrong',
        id: entry.id,
        record: wrongWords[entry.id]
      };
      delete wrongWords[entry.id];
    }

    saveCollections();
    render();
    showNotice(
      entry.word + (libraryType === 'favorite' ? ' 已取消收藏' : ' 已移出错题本'),
      true
    );
  }

  function undoRemoval() {
    if (!lastRemoval) return;

    if (lastRemoval.type === 'favorite') {
      favorites.add(lastRemoval.id);
    } else {
      wrongWords[lastRemoval.id] = lastRemoval.record;
    }

    lastRemoval = null;
    window.clearTimeout(noticeTimer);
    refs.libraryNotice.hidden = true;
    saveCollections();
    render();
  }

  function getLatestTimestamp(left, right) {
    var leftTime = new Date(left || 0).getTime() || 0;
    var rightTime = new Date(right || 0).getTime() || 0;
    return leftTime >= rightTime ? cleanTimestamp(left) : cleanTimestamp(right);
  }

  function mergeWrongRecord(localRecord, importedRecord) {
    var local = normalizeWrongRecord(localRecord);
    var imported = normalizeWrongRecord(importedRecord);
    var merged = {
      count: Math.max(local.count, imported.count)
    };
    var latestWrong = getLatestTimestamp(local.lastWrongAt, imported.lastWrongAt);
    var latestManual = getLatestTimestamp(local.addedManuallyAt, imported.addedManuallyAt);

    if (latestWrong) merged.lastWrongAt = latestWrong;
    if (latestManual) merged.addedManuallyAt = latestManual;
    return merged;
  }

  function exportWrongWords() {
    var records = getCollectionEntries().map(function (entry) {
      var record = normalizeWrongRecord(wrongWords[entry.id]);
      return {
        id: entry.id,
        word: entry.word,
        meaning: entry.meaning,
        list: entry.list,
        index: entry.index,
        count: record.count,
        lastWrongAt: record.lastWrongAt || null,
        addedManuallyAt: record.addedManuallyAt || null
      };
    });

    if (!records.length) {
      showNotice('错题本为空，暂无可导出的记录。', false);
      return;
    }

    try {
      var payload = {
        schema: EXPORT_SCHEMA,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        wrongWords: records
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download =
        'vocabulary-wrong-book-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 0);
      showNotice('已导出 ' + records.length + ' 条错题，可在其他设备导入。', false);
    } catch (error) {
      showNotice('导出失败，请检查浏览器的下载权限后重试。', false);
    }
  }

  function readFileAsText(file) {
    if (file && typeof file.text === 'function') return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  function parseImportPayload(text) {
    var payload = JSON.parse(text);
    if (
      !payload ||
      payload.schema !== EXPORT_SCHEMA ||
      Number(payload.version) !== EXPORT_VERSION ||
      !Array.isArray(payload.wrongWords)
    ) {
      throw new Error('unsupported');
    }
    return payload.wrongWords;
  }

  function importWrongWords(file) {
    if (!file) return;

    readFileAsText(file).then(function (text) {
      var records = parseImportPayload(text);
      var importedIds = new Set();
      var changed = 0;

      records.forEach(function (record) {
        if (!record || !entryById.has(record.id) || importedIds.has(record.id)) return;
        importedIds.add(record.id);
        var before = wrongWords[record.id]
          ? JSON.stringify(normalizeWrongRecord(wrongWords[record.id]))
          : '';
        wrongWords[record.id] = mergeWrongRecord(wrongWords[record.id], record);
        if (before !== JSON.stringify(wrongWords[record.id])) changed += 1;
      });

      if (!importedIds.size) throw new Error('empty');
      saveCollections();
      render();
      showNotice(
        '已读取 ' + importedIds.size + ' 条记录，合并更新 ' + changed + ' 条；原有错题未被覆盖。',
        false
      );
    }).catch(function () {
      showNotice('导入失败：请选择由本错题本导出的 JSON 文件。', false);
    }).finally(function () {
      refs.wrongImportInput.value = '';
    });
  }

  function speakWord(entry, button) {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      button.disabled = true;
      button.querySelector('span').textContent = '不支持朗读';
      return;
    }

    var utterance = new SpeechSynthesisUtterance(entry.word.split('/')[0]);
    var voices = window.speechSynthesis.getVoices();
    var voice = voices.find(function (candidate) {
      return /^en[-_]/i.test(candidate.lang);
    });

    utterance.lang = voice ? voice.lang : 'en-US';
    utterance.voice = voice || null;
    utterance.rate = 0.88;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    button.classList.remove('is-speaking');
    window.requestAnimationFrame(function () {
      button.classList.add('is-speaking');
      window.setTimeout(function () {
        button.classList.remove('is-speaking');
      }, 520);
    });
  }

  function bindEvents() {
    refs.collectionSearch.addEventListener('input', render);
    refs.collectionListFilter.addEventListener('change', render);
    refs.libraryUndoButton.addEventListener('click', undoRemoval);
    refs.collectionTestLink.addEventListener('click', function (event) {
      if (refs.collectionTestLink.classList.contains('is-disabled')) {
        event.preventDefault();
      }
    });

    if (libraryType === 'wrong' && refs.wrongShufflePanel) {
      refs.wrongShuffleAllLink.addEventListener('click', function (event) {
        if (refs.wrongShuffleAllLink.classList.contains('is-disabled')) {
          event.preventDefault();
        }
      });
      refs.wrongShuffleSelectAll.addEventListener('click', function () {
        setWrongShuffleLists(true);
      });
      refs.wrongShuffleClear.addEventListener('click', function () {
        setWrongShuffleLists(false);
      });
      refs.wrongShuffleSelectedButton.addEventListener('click', function () {
        var href = refs.wrongShuffleSelectedButton.dataset.href;
        if (!href || refs.wrongShuffleSelectedButton.disabled) return;
        window.location.href = href;
      });
    }

    if (libraryType === 'wrong' && refs.wrongDataActions) {
      refs.wrongExportButton.addEventListener('click', exportWrongWords);
      refs.wrongImportButton.addEventListener('click', function () {
        refs.wrongImportInput.click();
      });
      refs.wrongImportInput.addEventListener('change', function () {
        importWrongWords(refs.wrongImportInput.files && refs.wrongImportInput.files[0]);
      });
    }

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEYS.favorites && event.key !== STORAGE_KEYS.wrong) return;
      loadCollections();
      render();
    });
    window.addEventListener('pageshow', function () {
      loadCollections();
      render();
    });
  }

  function init() {
    cacheRefs();

    if (!lists.length) {
      refs.collectionList.innerHTML =
        '<div class="empty-msg">词汇数据加载失败，请刷新页面后重试。</div>';
      return;
    }

    loadCollections();
    bindEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
