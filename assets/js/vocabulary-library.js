/**
 * 独立词库模块
 * - 错题本 / 单词收藏分别查看
 * - 搜索、List 筛选、朗读、移除与撤销
 * - 与测试页共享 localStorage 数据
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
        if (entryById.has(id)) wrongWords[id] = storedWrong[id];
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
      'libraryNotice',
      'libraryNoticeText',
      'libraryUndoButton'
    ].forEach(function (id) {
      refs[id] = document.getElementById(id);
    });
  }

  function populateListFilter() {
    lists.forEach(function (list) {
      var option = document.createElement('option');
      option.value = String(list.list);
      option.textContent = 'List ' + list.list;
      refs.collectionListFilter.appendChild(option);
    });
  }

  function getCollectionEntries() {
    if (libraryType === 'favorite') {
      return allEntries.filter(function (entry) {
        return favorites.has(entry.id);
      });
    }

    return allEntries.filter(function (entry) {
      return Boolean(wrongWords[entry.id]);
    });
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
    meta.className = 'vocab-library-item-meta';
    meta.textContent = libraryType === 'wrong' ? formatWrongMeta(entry) : '已收藏 · 本设备保存';
    actions.className = 'vocab-library-item-actions';

    wordRow.appendChild(word);
    wordRow.appendChild(source);
    actions.appendChild(makeSpeechButton(entry));
    actions.appendChild(makeRemoveButton(entry));
    footer.appendChild(meta);
    footer.appendChild(actions);
    copy.appendChild(wordRow);
    copy.appendChild(meaning);
    copy.appendChild(footer);
    article.appendChild(sequence);
    article.appendChild(copy);
    return article;
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
        '答错的单词会自动加入这里，也可以在测试页手动添加。';
    }
  }

  function render() {
    var entries = getCollectionEntries();
    var visibleEntries = getVisibleEntries(entries);
    var fragment = document.createDocumentFragment();
    var wrongCount = Object.keys(wrongWords).length;

    refs.wrongModuleCount.textContent = String(wrongCount);
    refs.favoriteModuleCount.textContent = String(favorites.size);
    refs.collectionTotal.textContent = String(entries.length);
    refs.collectionVisibleCount.textContent = String(visibleEntries.length);
    refs.collectionTestLink.classList.toggle('is-disabled', entries.length === 0);
    refs.collectionTestLink.setAttribute('aria-disabled', String(entries.length === 0));

    visibleEntries.forEach(function (entry, index) {
      fragment.appendChild(renderEntry(entry, index));
    });
    refs.collectionList.replaceChildren(fragment);
    updateEmptyState(entries.length, visibleEntries.length);
  }

  function showRemovalNotice(entry) {
    window.clearTimeout(noticeTimer);
    refs.libraryNotice.hidden = false;
    refs.libraryNoticeText.textContent =
      entry.word + (libraryType === 'favorite' ? ' 已取消收藏' : ' 已移出错题本');
    noticeTimer = window.setTimeout(function () {
      refs.libraryNotice.hidden = true;
      lastRemoval = null;
    }, 6000);
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
    showRemovalNotice(entry);
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
    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEYS.favorites && event.key !== STORAGE_KEYS.wrong) return;
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
    populateListFilter();
    bindEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
