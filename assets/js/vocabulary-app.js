/**
 * 考研高频词测试终端
 * - 四选一 / 键入单词
 * - List 1-61 自由切换
 * - 全部错题或多个 List 错题混合乱序测试
 * - 艾宾浩斯今日复习、熟练度与每日统计
 * - 高频错词专项和按错误次数加权抽题
 * - 错题本、收藏夹、偏好和轻量进度存储在 localStorage
 * - 使用浏览器 SpeechSynthesis 朗读英文
 */
(function () {
  'use strict';

  var lists = Array.isArray(window.VOCABULARY_LISTS) ? window.VOCABULARY_LISTS : [];
  var STORAGE_KEYS = {
    favorites: 'vocabularyFavoritesV1',
    wrong: 'vocabularyWrongWordsV1',
    preferences: 'vocabularyPreferencesV1',
    session: 'vocabularySessionV1'
  };
  var SESSION_VERSION = 1;
  var MAX_SESSION_CHARS = 48000;
  var MAX_STORED_ANSWERS = 800;
  var REVIEW_UI_ENABLED = false;
  var learning = window.VocabularyLearning || null;

  var listByNumber = new Map();
  var entryById = new Map();
  var allEntries = [];

  lists.forEach(function (list) {
    listByNumber.set(list.list, list);
    list.entries.forEach(function (entry) {
      var enriched = Object.assign({ list: list.list }, entry);
      entryById.set(enriched.id, enriched);
      allEntries.push(enriched);
    });
  });

  var refs = {};
  var favorites = loadFavorites();
  var wrongWords = loadWrongWords();
  var learningProgress = learning ? learning.loadProgress() : {};
  var dailyStats = learning ? learning.loadDailyStats() : {};
  if (learning) {
    learningProgress = learning.seedFromWrongWords(
      learningProgress,
      wrongWords,
      new Set(entryById.keys())
    );
  }
  var preferences = loadPreferences();
  var requestedScope = getRequestedScope();
  var requestedWrongQuiz = getRequestedWrongQuiz();
  var requestedReviewQuiz = getRequestedReviewQuiz();
  var storedSession = loadSessionSnapshot();
  var collectionNoticeTimer = 0;
  var collectionPulseTimer = 0;
  var state = {
    listNumber: clampListNumber(
      storedSession && storedSession.listNumber || preferences.listNumber || 1
    ),
    mode: storedSession && storedSession.mode === 'typing' ||
      !storedSession && preferences.mode === 'typing'
      ? 'typing'
      : 'choice',
    scope: requestedScope ||
      storedSession && normalizeScope(storedSession.scope) ||
      'list',
    wrongListNumber: normalizeWrongListNumber(
      storedSession && storedSession.wrongListNumber
    ),
    wrongShuffle: Boolean(
      requestedWrongQuiz ||
      !requestedScope && storedSession && storedSession.wrongShuffle
    ),
    wrongShuffleLists: requestedWrongQuiz
      ? requestedWrongQuiz.listNumbers
      : normalizeWrongShuffleLists(storedSession && storedSession.wrongShuffleLists),
    wrongShuffleRoundId: requestedWrongQuiz
      ? requestedWrongQuiz.roundId
      : String(storedSession && storedSession.wrongShuffleRoundId || '').slice(0, 24),
    wrongQuizMode: requestedWrongQuiz
      ? requestedWrongQuiz.mode
      : normalizeWrongQuizMode(storedSession && storedSession.wrongQuizMode),
    smartLimit: requestedWrongQuiz
      ? requestedWrongQuiz.limit
      : normalizeSmartLimit(storedSession && storedSession.smartLimit),
    reviewRoundId: requestedReviewQuiz
      ? requestedReviewQuiz.roundId
      : String(storedSession && storedSession.reviewRoundId || '').slice(0, 24),
    reviewLimit: requestedReviewQuiz
      ? requestedReviewQuiz.limit
      : normalizeReviewLimit(storedSession && storedSession.reviewLimit),
    shuffleSeed: normalizeShuffleSeed(storedSession && storedSession.shuffleSeed),
    deck: [],
    position: 0,
    answers: Object.create(null),
    correct: 0,
    wrong: 0,
    completed: false,
    draft: ''
  };

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function loadFavorites() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEYS.favorites), []);
    if (!Array.isArray(stored)) return new Set();
    return new Set(stored.filter(function (id) {
      return entryById.has(id);
    }));
  }

  function loadWrongWords() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEYS.wrong), {});
    if (!stored || Array.isArray(stored) || typeof stored !== 'object') return {};

    var cleaned = {};
    Object.keys(stored).forEach(function (id) {
      if (entryById.has(id)) cleaned[id] = stored[id];
    });
    return cleaned;
  }

  function loadPreferences() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEYS.preferences), {});
    return stored && typeof stored === 'object' ? stored : {};
  }

  function loadSessionSnapshot() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEYS.session), null);
    if (!stored || typeof stored !== 'object' || Number(stored.version) !== SESSION_VERSION) {
      return null;
    }
    return stored;
  }

  function reloadPersistentState() {
    favorites = loadFavorites();
    wrongWords = loadWrongWords();
    if (learning) {
      learningProgress = learning.seedFromWrongWords(
        learning.loadProgress(),
        wrongWords,
        new Set(entryById.keys())
      );
      dailyStats = learning.loadDailyStats();
    }

    if (state.scope === 'wrong' || state.scope === 'favorite') {
      refreshCollectionDeck();
    } else {
      render();
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(Array.from(favorites)));
    } catch (error) {
      // The quiz remains usable when browser storage is unavailable.
    }
  }

  function saveWrongWords() {
    try {
      localStorage.setItem(STORAGE_KEYS.wrong, JSON.stringify(wrongWords));
    } catch (error) {
      // The quiz remains usable when browser storage is unavailable.
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify({
        listNumber: state.listNumber,
        mode: state.mode
      }));
    } catch (error) {
      // The quiz remains usable when browser storage is unavailable.
    }
  }

  function clampListNumber(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.min(61, Math.round(number)));
  }

  function normalizeScope(scope) {
    var allowedScopes = ['list', 'wrong', 'favorite'];
    if (REVIEW_UI_ENABLED) allowedScopes.push('review');
    return allowedScopes.indexOf(scope) !== -1 ? scope : '';
  }

  function normalizeWrongQuizMode(value) {
    return ['shuffle', 'high', 'weighted'].indexOf(value) !== -1 ? value : 'shuffle';
  }

  function normalizeSmartLimit(value) {
    if (value === 'all') return 'all';
    var number = Math.floor(Number(value) || 30);
    return Math.max(5, Math.min(200, number));
  }

  function normalizeReviewLimit(value) {
    var number = Math.floor(Number(value) || 20);
    return Math.max(1, Math.min(1826, number));
  }

  function normalizeWrongListNumber(value) {
    if (value === 'all' || value === undefined || value === null || value === '') {
      return 'all';
    }
    return clampListNumber(value);
  }

  function normalizeWrongShuffleLists(value) {
    if (value === 'all' || !Array.isArray(value)) return 'all';

    return Array.from(new Set(value.map(function (listNumber) {
      return Number(listNumber);
    }).filter(function (listNumber) {
      return Number.isInteger(listNumber) && listNumber >= 1 && listNumber <= 61;
    }))).sort(function (left, right) {
      return left - right;
    });
  }

  function normalizeShuffleSeed(value) {
    var seed = Number(value);
    return Number.isInteger(seed) && seed > 0 ? seed >>> 0 : 0;
  }

  function getRequestedScope() {
    try {
      var scope = new URLSearchParams(window.location.search).get('scope');
      var allowedScopes = ['wrong', 'favorite'];
      if (REVIEW_UI_ENABLED) allowedScopes.push('review');
      return allowedScopes.indexOf(scope) !== -1 ? scope : '';
    } catch (error) {
      return '';
    }
  }

  function getRequestedWrongQuiz() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('scope') !== 'wrong' || params.get('shuffle') !== '1') {
        return null;
      }

      var rawLists = String(params.get('wrongLists') || 'all').trim();
      var roundId = String(params.get('round') || '').slice(0, 24);
      var mode = normalizeWrongQuizMode(params.get('wrongMode'));
      var limit = normalizeSmartLimit(params.get('limit'));
      if (!rawLists || rawLists === 'all') {
        return { listNumbers: 'all', roundId: roundId, mode: mode, limit: limit };
      }

      var listNumbers = normalizeWrongShuffleLists(rawLists.split(','));
      return {
        listNumbers: Array.isArray(listNumbers) && listNumbers.length
          ? listNumbers
          : 'all',
        roundId: roundId,
        mode: mode,
        limit: limit
      };
    } catch (error) {
      return null;
    }
  }

  function getRequestedReviewQuiz() {
    if (!REVIEW_UI_ENABLED) return null;
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('scope') !== 'review') return null;
      return {
        roundId: String(params.get('round') || '').slice(0, 24),
        limit: normalizeReviewLimit(params.get('limit'))
      };
    } catch (error) {
      return null;
    }
  }

  function sameWrongShuffleLists(left, right) {
    var normalizedLeft = normalizeWrongShuffleLists(left);
    var normalizedRight = normalizeWrongShuffleLists(right);

    if (normalizedLeft === 'all' || normalizedRight === 'all') {
      return normalizedLeft === normalizedRight;
    }
    return normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every(function (listNumber, index) {
        return listNumber === normalizedRight[index];
      });
  }

  function compactAnswer(entry, answer) {
    if (state.mode === 'typing') {
      return [
        entry.id,
        answer.correct ? 1 : 0,
        String(answer.typedValue || '').slice(0, 80)
      ];
    }

    var selectedIndex = Number(answer.selectedIndex);
    if (!Number.isInteger(selectedIndex)) {
      var options = getChoiceOptions(entry);
      selectedIndex = options.findIndex(function (option) {
        return option.meaning === answer.selectedMeaning;
      });
    }
    return [entry.id, answer.correct ? 1 : 0, Math.max(0, selectedIndex)];
  }

  function buildSessionSnapshot() {
    var currentEntry = getCurrentEntry();
    var deckPositionById = new Map();
    state.deck.forEach(function (entry, index) {
      deckPositionById.set(entry.id, index);
    });

    var answeredIds = Object.keys(state.answers).filter(function (id) {
      return entryById.has(id) && deckPositionById.has(id);
    });
    answeredIds.sort(function (left, right) {
      var leftDistance = Math.abs(deckPositionById.get(left) - state.position);
      var rightDistance = Math.abs(deckPositionById.get(right) - state.position);
      return leftDistance - rightDistance;
    });

    var retainedIds = answeredIds.slice(0, MAX_STORED_ANSWERS);
    var snapshot = {
      version: SESSION_VERSION,
      savedAt: new Date().toISOString(),
      listNumber: state.listNumber,
      mode: state.mode,
      scope: state.scope,
      wrongListNumber: state.wrongListNumber,
      wrongShuffle: state.wrongShuffle,
      wrongShuffleLists: state.wrongShuffleLists,
      wrongShuffleRoundId: state.wrongShuffleRoundId,
      wrongQuizMode: state.wrongQuizMode,
      smartLimit: state.smartLimit,
      reviewRoundId: state.reviewRoundId,
      reviewLimit: state.reviewLimit,
      reviewDeckIds: state.scope === 'review'
        ? state.deck.map(function (entry) { return entry.id; })
        : [],
      shuffleSeed: state.shuffleSeed,
      currentEntryId: currentEntry ? currentEntry.id : '',
      position: state.position,
      completed: state.completed,
      correct: state.correct,
      wrong: state.wrong,
      draft: String(state.draft || '').slice(0, 80),
      truncated: retainedIds.length < answeredIds.length,
      answers: retainedIds.map(function (id) {
        return compactAnswer(entryById.get(id), state.answers[id]);
      })
    };
    var serialized = JSON.stringify(snapshot);

    while (serialized.length > MAX_SESSION_CHARS && snapshot.answers.length > 0) {
      snapshot.answers.pop();
      snapshot.truncated = true;
      serialized = JSON.stringify(snapshot);
    }
    return serialized;
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEYS.session, buildSessionSnapshot());
    } catch (error) {
      // Never clear existing data when storage is full or unavailable.
    }
  }

  function restoreSession(snapshot) {
    if (!snapshot || (requestedScope && requestedScope !== normalizeScope(snapshot.scope))) {
      return false;
    }

    if (requestedWrongQuiz && (
      !snapshot.wrongShuffle ||
      !sameWrongShuffleLists(snapshot.wrongShuffleLists, requestedWrongQuiz.listNumbers) ||
      String(snapshot.wrongShuffleRoundId || '') !== requestedWrongQuiz.roundId ||
      normalizeWrongQuizMode(snapshot.wrongQuizMode) !== requestedWrongQuiz.mode ||
      normalizeSmartLimit(snapshot.smartLimit) !== requestedWrongQuiz.limit
    )) {
      return false;
    }

    if (requestedReviewQuiz && (
      normalizeScope(snapshot.scope) !== 'review' ||
      String(snapshot.reviewRoundId || '') !== requestedReviewQuiz.roundId ||
      normalizeReviewLimit(snapshot.reviewLimit) !== requestedReviewQuiz.limit
    )) {
      return false;
    }

    if (requestedScope === 'wrong' && !requestedWrongQuiz && snapshot.wrongShuffle) {
      return false;
    }

    state.wrongShuffle = Boolean(snapshot.wrongShuffle && state.scope === 'wrong');
    state.wrongShuffleLists = requestedWrongQuiz
      ? requestedWrongQuiz.listNumbers
      : normalizeWrongShuffleLists(snapshot.wrongShuffleLists);
    state.wrongShuffleRoundId = requestedWrongQuiz
      ? requestedWrongQuiz.roundId
      : String(snapshot.wrongShuffleRoundId || '').slice(0, 24);
    state.wrongQuizMode = requestedWrongQuiz
      ? requestedWrongQuiz.mode
      : normalizeWrongQuizMode(snapshot.wrongQuizMode);
    state.smartLimit = requestedWrongQuiz
      ? requestedWrongQuiz.limit
      : normalizeSmartLimit(snapshot.smartLimit);
    state.reviewRoundId = requestedReviewQuiz
      ? requestedReviewQuiz.roundId
      : String(snapshot.reviewRoundId || '').slice(0, 24);
    state.reviewLimit = requestedReviewQuiz
      ? requestedReviewQuiz.limit
      : normalizeReviewLimit(snapshot.reviewLimit);
    state.shuffleSeed = normalizeShuffleSeed(snapshot.shuffleSeed) || createShuffleSeed();

    normalizeWrongListSelection();
    state.deck = state.scope === 'review' && Array.isArray(snapshot.reviewDeckIds)
      ? snapshot.reviewDeckIds.map(function (id) {
        return entryById.get(id);
      }).filter(Boolean)
      : getDeck();
    state.answers = Object.create(null);
    state.completed = Boolean(snapshot.completed && state.deck.length);
    state.draft = String(snapshot.draft || '').slice(0, 80);

    var savedPosition = Math.max(0, Math.floor(Number(snapshot.position) || 0));
    var currentIndex = snapshot.currentEntryId
      ? state.deck.findIndex(function (entry) { return entry.id === snapshot.currentEntryId; })
      : -1;
    state.position = state.deck.length
      ? Math.min(currentIndex >= 0 ? currentIndex : savedPosition, state.deck.length - 1)
      : 0;

    var restoredCorrect = 0;
    var restoredWrong = 0;
    if (Array.isArray(snapshot.answers)) {
      snapshot.answers.forEach(function (row) {
        if (!Array.isArray(row) || row.length < 3) return;
        var entry = entryById.get(row[0]);
        if (!entry || !state.deck.some(function (item) { return item.id === entry.id; })) return;
        var answer = { correct: row[1] === 1 };

        if (state.mode === 'typing') {
          answer.typedValue = String(row[2] || '').slice(0, 80);
        } else {
          var options = getChoiceOptions(entry);
          var selectedIndex = Math.max(
            0,
            Math.min(options.length - 1, Number(row[2]) || 0)
          );
          var option = options[selectedIndex];
          answer.selectedMeaning = option ? option.meaning : entry.meaning;
          answer.selectedIndex = selectedIndex;
        }
        state.answers[entry.id] = answer;
        if (answer.correct) restoredCorrect += 1;
        else restoredWrong += 1;
      });
    }

    state.correct = snapshot.truncated
      ? Math.max(restoredCorrect, Math.floor(Number(snapshot.correct) || 0))
      : restoredCorrect;
    state.wrong = snapshot.truncated
      ? Math.max(restoredWrong, Math.floor(Number(snapshot.wrong) || 0))
      : restoredWrong;
    return true;
  }

  function cacheRefs() {
    [
      'listSelect',
      'listCount',
      'modeSwitcher',
      'scopeSwitcher',
      'currentListCount',
      'wrongCount',
      'favoriteCount',
      'todayReviewCount',
      'wrongModuleCount',
      'favoriteModuleCount',
      'sessionCorrect',
      'sessionWrong',
      'sessionAccuracy',
      'resetSession',
      'quizScopeLabel',
      'quizProgressText',
      'quizProgressBar',
      'collectionNotice',
      'collectionNoticeIcon',
      'collectionNoticeText',
      'emptyState',
      'emptyTitle',
      'emptyDescription',
      'emptyReturnButton',
      'quizContent',
      'wordSource',
      'wordStatus',
      'promptLabel',
      'wordPrompt',
      'favoriteButton',
      'speakButton',
      'questionArea',
      'answerFeedback',
      'feedbackBadge',
      'feedbackTitle',
      'feedbackDetail',
      'wrongToggleButton',
      'previousButton',
      'nextButton',
      'quizSummary',
      'summaryAccuracy',
      'summaryCorrect',
      'summaryWrong',
      'summaryTotal',
      'restartButton'
    ].forEach(function (id) {
      refs[id] = document.getElementById(id);
    });
  }

  function renderListOptions() {
    refs.listSelect.innerHTML = '';

    if (state.scope === 'review') {
      var reviewOption = document.createElement('option');
      reviewOption.value = 'review';
      reviewOption.textContent = '今日复习 · ' + state.deck.length + ' 词';
      refs.listSelect.appendChild(reviewOption);
      refs.listSelect.value = 'review';
      return;
    }

    if (state.scope === 'wrong') {
      normalizeWrongListSelection();
      var wrongEntries = getWrongEntries();
      var wrongListNumbers = getWrongListNumbers(wrongEntries);

      if (state.wrongShuffle) {
        var shuffleOption = document.createElement('option');
        var shuffleEntries = getSelectedWrongEntries(wrongEntries);
        shuffleOption.value = 'shuffle';
        shuffleOption.textContent = state.wrongQuizMode === 'high'
          ? '高频错词专项 · ' + getHighFrequencyEntries(shuffleEntries).length + ' 词'
          : state.wrongQuizMode === 'weighted'
            ? '智能抽题 · ' + Math.min(
              state.smartLimit === 'all' ? shuffleEntries.length : state.smartLimit,
              shuffleEntries.length
            ) + ' 词'
            : state.wrongShuffleLists === 'all'
              ? '乱序 · 全部错题 · ' + shuffleEntries.length + ' 词'
              : '乱序 · ' + state.wrongShuffleLists.length + ' 个 List · ' +
                shuffleEntries.length + ' 词';
        refs.listSelect.appendChild(shuffleOption);
        refs.listSelect.value = 'shuffle';
        return;
      }

      var allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = '全部错题 · ' + wrongEntries.length + ' 词';
      refs.listSelect.appendChild(allOption);

      wrongListNumbers.forEach(function (listNumber) {
        var option = document.createElement('option');
        var count = wrongEntries.filter(function (entry) {
          return entry.list === listNumber;
        }).length;
        option.value = String(listNumber);
        option.textContent = 'List ' + listNumber + ' · ' + count + ' 个错词';
        refs.listSelect.appendChild(option);
      });
      refs.listSelect.value = String(state.wrongListNumber);
      return;
    }

    lists.forEach(function (list) {
      var option = document.createElement('option');
      option.value = String(list.list);
      option.textContent = 'List ' + list.list + ' · ' + list.entries.length + ' 词';
      refs.listSelect.appendChild(option);
    });
    refs.listSelect.value = String(state.listNumber);
  }

  function getWrongEntries() {
    return allEntries.filter(function (entry) {
      return Boolean(wrongWords[entry.id]);
    });
  }

  function getWrongListNumbers(entries) {
    return Array.from(new Set(entries.map(function (entry) {
      return entry.list;
    }))).sort(function (left, right) {
      return left - right;
    });
  }

  function normalizeWrongListSelection() {
    if (state.wrongShuffle) {
      if (state.wrongShuffleLists === 'all') return;
      var availableLists = new Set(getWrongListNumbers(getWrongEntries()));
      state.wrongShuffleLists = normalizeWrongShuffleLists(
        state.wrongShuffleLists.filter(function (listNumber) {
          return availableLists.has(listNumber);
        })
      );
      return;
    }

    if (state.wrongListNumber === 'all') return;
    var available = getWrongListNumbers(getWrongEntries());
    if (available.indexOf(Number(state.wrongListNumber)) === -1) {
      state.wrongListNumber = 'all';
    }
  }

  function getSelectedWrongEntries(entries) {
    var source = entries || getWrongEntries();

    if (state.wrongShuffle) {
      if (state.wrongShuffleLists === 'all') return source.slice();
      var selectedLists = new Set(state.wrongShuffleLists);
      return source.filter(function (entry) {
        return selectedLists.has(entry.list);
      });
    }

    return source.filter(function (entry) {
      return state.wrongListNumber === 'all' ||
        entry.list === Number(state.wrongListNumber);
    });
  }

  function getWrongCount(entry) {
    var item = entry && wrongWords[entry.id];
    return Math.max(0, Math.floor(Number(item && item.count) || 0));
  }

  function getHighFrequencyEntries(entries) {
    return entries.filter(function (entry) {
      return getWrongCount(entry) >= 3;
    }).sort(function (left, right) {
      return getWrongCount(right) - getWrongCount(left);
    });
  }

  function weightedSample(entries, limit, random) {
    var pool = entries.slice();
    var target = limit === 'all'
      ? pool.length
      : Math.min(pool.length, Math.max(1, Number(limit) || 30));
    var selected = [];

    while (pool.length && selected.length < target) {
      var totalWeight = pool.reduce(function (total, entry) {
        var wrongCount = getWrongCount(entry);
        return total + 1 + wrongCount * wrongCount;
      }, 0);
      var cursor = random() * totalWeight;
      var selectedIndex = pool.length - 1;

      for (var index = 0; index < pool.length; index += 1) {
        var count = getWrongCount(pool[index]);
        cursor -= 1 + count * count;
        if (cursor <= 0) {
          selectedIndex = index;
          break;
        }
      }
      selected.push(pool.splice(selectedIndex, 1)[0]);
    }
    return selected;
  }

  function getDeck() {
    if (state.scope === 'wrong') {
      var wrongDeck = getSelectedWrongEntries(getWrongEntries());
      if (!state.wrongShuffle) return wrongDeck;

      var random = createRandom(state.shuffleSeed || createShuffleSeed());
      if (state.wrongQuizMode === 'high') {
        return shuffled(getHighFrequencyEntries(wrongDeck), random);
      }
      if (state.wrongQuizMode === 'weighted') {
        return weightedSample(wrongDeck, state.smartLimit, random);
      }
      return shuffled(wrongDeck, random);
    }

    if (state.scope === 'favorite') {
      return allEntries.filter(function (entry) {
        return favorites.has(entry.id);
      });
    }

    if (state.scope === 'review') {
      return learning
        ? learning.getDueEntries(allEntries, learningProgress, Date.now())
          .slice(0, state.reviewLimit)
        : [];
    }

    var currentList = listByNumber.get(state.listNumber);
    return currentList ? currentList.entries.map(function (entry) {
      return entryById.get(entry.id);
    }) : [];
  }

  function resetRound(options) {
    var config = options || {};
    if (state.scope === 'wrong' && state.wrongShuffle && !config.preserveShuffle) {
      state.shuffleSeed = createShuffleSeed();
    }
    state.deck = getDeck();
    if (state.scope === 'review') renderListOptions();
    state.position = 0;
    state.answers = Object.create(null);
    state.correct = 0;
    state.wrong = 0;
    state.completed = false;
    state.draft = '';
    render();

    if (config.scroll && window.matchMedia('(max-width: 900px)').matches) {
      var quizPanel = document.querySelector('.vocab-quiz-panel');
      if (quizPanel) {
        window.requestAnimationFrame(function () {
          var top = window.scrollY + quizPanel.getBoundingClientRect().top - 70;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        });
      }
    }
  }

  function refreshCollectionDeck() {
    if (state.scope === 'list' || state.scope === 'review') {
      render();
      return;
    }

    if (state.scope === 'wrong') {
      normalizeWrongListSelection();
      renderListOptions();
    }
    state.deck = getDeck();
    if (state.deck.length === 0) {
      state.position = 0;
      state.completed = false;
    } else {
      state.position = Math.min(state.position, state.deck.length - 1);
    }
    render();
  }

  function updateCollectionControls(entry) {
    var isFavorite = Boolean(entry && favorites.has(entry.id));
    var inWrongBook = Boolean(entry && wrongWords[entry.id]);

    refs.wrongCount.textContent = String(Object.keys(wrongWords).length);
    refs.favoriteCount.textContent = String(favorites.size);
    refs.wrongModuleCount.textContent = String(Object.keys(wrongWords).length);
    refs.favoriteModuleCount.textContent = String(favorites.size);

    if (!entry) return;

    refs.favoriteButton.classList.toggle('active', isFavorite);
    refs.favoriteButton.setAttribute('aria-pressed', String(isFavorite));
    refs.favoriteButton.setAttribute(
      'aria-label',
      isFavorite ? '取消收藏当前单词' : '收藏当前单词'
    );
    refs.favoriteButton.title = isFavorite ? '取消收藏当前单词' : '收藏当前单词';

    refs.wrongToggleButton.textContent = inWrongBook ? '已加入错题本 · 点击移出' : '加入错题本';
    refs.wrongToggleButton.classList.toggle('active', inWrongBook);
    refs.wrongToggleButton.setAttribute('aria-pressed', String(inWrongBook));
  }

  function showCollectionNotice(type, added, entry) {
    var isFavorite = type === 'favorite';
    var count = isFavorite ? favorites.size : Object.keys(wrongWords).length;
    var scope = isFavorite ? '收藏夹' : '错题本';
    var action = added
      ? isFavorite ? '已收藏' : '已加入错题本'
      : isFavorite ? '已取消收藏' : '已移出错题本';
    var scopeButton = refs.scopeSwitcher.querySelector('[data-scope="' + type + '"]');

    window.clearTimeout(collectionNoticeTimer);
    window.clearTimeout(collectionPulseTimer);
    refs.collectionNotice.hidden = false;
    refs.collectionNotice.className =
      'vocab-collection-notice ' + (added ? 'is-added' : 'is-removed');
    refs.collectionNoticeIcon.textContent = added ? '✓' : '−';
    refs.collectionNoticeText.textContent =
      entry.word + ' ' + action + ' · ' + scope + '共 ' + count + ' 个词';

    if (scopeButton) {
      scopeButton.classList.remove('is-updated');
      void scopeButton.offsetWidth;
      scopeButton.classList.add('is-updated');
      collectionPulseTimer = window.setTimeout(function () {
        scopeButton.classList.remove('is-updated');
      }, 650);
    }

    collectionNoticeTimer = window.setTimeout(function () {
      refs.collectionNotice.hidden = true;
    }, 2600);
  }

  function getCurrentEntry() {
    return state.deck[state.position] || null;
  }

  function getAnsweredState(entry) {
    return entry ? state.answers[entry.id] || null : null;
  }

  function updateControlState() {
    var currentList = listByNumber.get(state.listNumber);
    var currentCount = currentList ? currentList.entries.length : 0;
    var wrongEntries = getWrongEntries();
    var wrongListNumbers = getWrongListNumbers(wrongEntries);
    var selectedWrongEntries = getSelectedWrongEntries(wrongEntries);
    var selectedWrongCount = selectedWrongEntries.length;
    var dueReviewCount = learning
      ? learning.getDueEntries(allEntries, learningProgress, Date.now()).length
      : 0;
    var answeredTotal = state.correct + state.wrong;
    var accuracy = answeredTotal ? Math.round((state.correct / answeredTotal) * 100) + '%' : '--';

    refs.listSelect.value = state.scope === 'wrong'
      ? state.wrongShuffle ? 'shuffle' : String(state.wrongListNumber)
      : state.scope === 'review' ? 'review' : String(state.listNumber);
    refs.listSelect.disabled = state.scope === 'favorite' || state.scope === 'review' ||
      state.scope === 'wrong' && state.wrongShuffle;
    refs.listCount.textContent = state.scope === 'list'
      ? '当前词表共 ' + currentCount + ' 个词'
      : state.scope === 'wrong'
        ? state.wrongShuffle
          ? state.wrongQuizMode === 'high'
            ? '错误 3 次及以上 · 共 ' + state.deck.length + ' 个高频错词'
            : state.wrongQuizMode === 'weighted'
              ? '按错误次数加权 · 本轮智能抽取 ' + state.deck.length + ' 个词'
              : state.wrongShuffleLists === 'all'
                ? '全部 ' + selectedWrongCount + ' 个错词已随机打乱'
                : '已混合 ' + state.wrongShuffleLists.length + ' 个 List · 共 ' +
                  selectedWrongCount + ' 个错词'
          : state.wrongListNumber === 'all'
            ? '错题本共 ' + wrongEntries.length + ' 个词 · 分布在 ' +
              wrongListNumbers.length + ' 个 List'
            : 'List ' + state.wrongListNumber + ' · 共 ' + selectedWrongCount + ' 个错词'
        : state.scope === 'review'
          ? '艾宾浩斯计划 · 当前有 ' + state.deck.length + ' 个到期词'
          : '收藏夹覆盖全部 61 个 List';
    refs.currentListCount.textContent = String(currentCount);
    refs.todayReviewCount.textContent = String(dueReviewCount);
    updateCollectionControls(getCurrentEntry());
    refs.sessionCorrect.textContent = String(state.correct);
    refs.sessionWrong.textContent = String(state.wrong);
    refs.sessionAccuracy.textContent = accuracy;

    Array.prototype.forEach.call(
      refs.modeSwitcher.querySelectorAll('[data-mode]'),
      function (button) {
        var active = button.getAttribute('data-mode') === state.mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    );

    Array.prototype.forEach.call(
      refs.scopeSwitcher.querySelectorAll('[data-scope]'),
      function (button) {
        var active = button.getAttribute('data-scope') === state.scope;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    );
  }

  function updateProgress(entry) {
    var total = state.deck.length;
    var current = entry ? state.position + 1 : 0;
    var percent = total ? Math.round((current / total) * 100) : 0;
    var scopeLabel = state.scope === 'wrong'
      ? state.wrongShuffle
        ? state.wrongQuizMode === 'high'
          ? 'WRONG_BOOK · HIGH_FREQUENCY'
          : state.wrongQuizMode === 'weighted'
            ? 'WRONG_BOOK · SMART_WEIGHTED'
            : state.wrongShuffleLists === 'all'
              ? 'WRONG_BOOK · SHUFFLE_ALL'
              : 'WRONG_BOOK · SHUFFLE_' + state.wrongShuffleLists.length + '_LISTS'
        : state.wrongListNumber === 'all'
          ? 'WRONG_BOOK · ALL_LISTS'
          : 'WRONG_BOOK · LIST ' + String(state.wrongListNumber).padStart(2, '0')
      : state.scope === 'favorite'
        ? 'FAVORITES'
        : state.scope === 'review'
          ? 'EBBINGHAUS · TODAY_REVIEW'
          : 'LIST ' + String(state.listNumber).padStart(2, '0');

    refs.quizScopeLabel.textContent = scopeLabel;
    refs.quizProgressText.textContent = current + ' / ' + total;
    refs.quizProgressBar.style.width = percent + '%';
  }

  function renderEmptyState() {
    var isWrongBook = state.scope === 'wrong';
    var isFavorites = state.scope === 'favorite';
    var isReview = state.scope === 'review';

    refs.emptyState.hidden = false;
    refs.quizContent.hidden = true;
    refs.quizSummary.hidden = true;

    if (isWrongBook) {
      refs.emptyTitle.textContent = '错题本还是空的';
      refs.emptyDescription.textContent = '答错的词会自动加入这里，方便之后集中复习。';
    } else if (isReview) {
      refs.emptyTitle.textContent = '今天的到期复习已完成';
      refs.emptyDescription.textContent = '新的复习任务会按艾宾浩斯间隔自动出现，可去学习进度中心查看安排。';
    } else if (isFavorites) {
      refs.emptyTitle.textContent = '还没有收藏单词';
      refs.emptyDescription.textContent = '测试时点击星标，即可把想重点复习的词保存在本设备。';
    } else {
      refs.emptyTitle.textContent = '这个 List 暂无词条';
      refs.emptyDescription.textContent = '请切换到其他 List 后继续测试。';
    }
  }

  function renderSummary() {
    var answeredTotal = state.correct + state.wrong;
    var accuracy = answeredTotal ? Math.round((state.correct / answeredTotal) * 100) : 0;

    refs.emptyState.hidden = true;
    refs.quizContent.hidden = true;
    refs.quizSummary.hidden = false;
    refs.summaryAccuracy.textContent = accuracy + '%';
    refs.summaryCorrect.textContent = String(state.correct);
    refs.summaryWrong.textContent = String(state.wrong);
    refs.summaryTotal.textContent = String(state.deck.length);
    refs.quizProgressText.textContent = state.deck.length + ' / ' + state.deck.length;
    refs.quizProgressBar.style.width = '100%';
  }

  function renderQuestion(entry) {
    var answered = getAnsweredState(entry);
    var isTyping = state.mode === 'typing';

    refs.emptyState.hidden = true;
    refs.quizSummary.hidden = true;
    refs.quizContent.hidden = false;
    refs.wordSource.textContent =
      'LIST ' + String(entry.list).padStart(2, '0') +
      ' · #' + String(entry.index).padStart(2, '0');
    refs.wordStatus.textContent = answered
      ? answered.correct ? '回答正确' : '回答错误'
      : '待作答';
    refs.wordStatus.className = answered
      ? answered.correct ? 'is-correct' : 'is-wrong'
      : '';
    refs.promptLabel.textContent = isTyping
      ? '根据释义键入对应的英文单词'
      : '选择与下列单词匹配的释义';
    refs.wordPrompt.textContent = isTyping ? entry.meaning : entry.word;
    refs.wordPrompt.lang = isTyping ? 'zh-CN' : 'en';
    refs.wordPrompt.classList.toggle('is-meaning', isTyping);

    updateCollectionControls(entry);

    var speechLocked = isTyping && !answered;
    refs.speakButton.disabled = speechLocked;
    refs.speakButton.title = speechLocked ? '作答后可朗读单词' : '朗读当前单词';

    refs.previousButton.disabled = state.position === 0;
    refs.nextButton.disabled = !answered;
    refs.nextButton.textContent = state.position === state.deck.length - 1 ? '查看结果' : '下一题';

    if (isTyping) {
      renderTypingQuestion(entry, answered);
    } else {
      renderChoiceQuestion(entry, answered);
    }

    renderFeedback(entry, answered);
  }

  function hashString(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createShuffleSeed() {
    try {
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var values = new Uint32Array(1);
        window.crypto.getRandomValues(values);
        return values[0] || 1;
      }
    } catch (error) {
      // Fall back to a small time-based seed when secure randomness is unavailable.
    }

    return (Date.now() ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0 || 1;
  }

  function createRandom(seed) {
    var value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      var result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(values, random) {
    var result = values.slice();
    for (var index = result.length - 1; index > 0; index -= 1) {
      var swapIndex = Math.floor(random() * (index + 1));
      var temporary = result[index];
      result[index] = result[swapIndex];
      result[swapIndex] = temporary;
    }
    return result;
  }

  function getChoiceOptions(entry) {
    var random = createRandom(hashString(entry.id + ':options'));
    var sourceList = listByNumber.get(entry.list);
    var localCandidates = sourceList
      ? sourceList.entries.map(function (item) { return entryById.get(item.id); })
      : [];
    var candidatePool = shuffled(
      localCandidates.concat(shuffled(allEntries, random)),
      random
    );
    var meanings = new Set([entry.meaning]);
    var options = [{ id: entry.id, meaning: entry.meaning }];

    for (var index = 0; index < candidatePool.length && options.length < 4; index += 1) {
      var candidate = candidatePool[index];
      if (candidate.id === entry.id || meanings.has(candidate.meaning)) continue;
      meanings.add(candidate.meaning);
      options.push({ id: candidate.id, meaning: candidate.meaning });
    }

    return shuffled(options, random);
  }

  function renderChoiceQuestion(entry, answered) {
    var options = getChoiceOptions(entry);
    var list = document.createElement('div');
    list.className = 'vocab-choice-list';

    options.forEach(function (option, index) {
      var button = document.createElement('button');
      var marker = document.createElement('span');
      var copy = document.createElement('span');
      var isCorrect = option.meaning === entry.meaning;
      var isSelected = answered && answered.selectedMeaning === option.meaning;

      button.type = 'button';
      button.className = 'vocab-choice';
      button.dataset.meaning = option.meaning;
      marker.className = 'vocab-choice-marker';
      marker.textContent = String.fromCharCode(65 + index);
      copy.className = 'vocab-choice-copy';
      copy.textContent = option.meaning;
      button.appendChild(marker);
      button.appendChild(copy);

      if (answered) {
        button.disabled = true;
        if (isCorrect) button.classList.add('is-correct');
        if (isSelected && !answered.correct) button.classList.add('is-wrong');
        if (isSelected) button.classList.add('is-selected');
      } else {
        button.addEventListener('click', function () {
          submitChoice(entry, option.meaning, index);
        });
      }

      list.appendChild(button);
    });

    refs.questionArea.replaceChildren(list);
  }

  function renderTypingQuestion(entry, answered) {
    var form = document.createElement('form');
    var inputRow = document.createElement('div');
    var input = document.createElement('input');
    var submit = document.createElement('button');
    var hint = document.createElement('p');

    form.className = 'vocab-typing-form';
    inputRow.className = 'vocab-typing-row';
    input.type = 'text';
    input.name = 'answer';
    input.placeholder = '键入英文单词…';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.setAttribute('aria-label', '输入英文单词');
    submit.type = 'submit';
    submit.textContent = '提交答案';
    hint.className = 'vocab-typing-hint';
    hint.textContent = '忽略大小写；英美拼写变体会同时识别。';

    if (answered) {
      input.value = answered.typedValue;
      input.disabled = true;
      submit.disabled = true;
      input.classList.add(answered.correct ? 'is-correct' : 'is-wrong');
    } else {
      input.value = state.draft;
    }

    inputRow.appendChild(input);
    inputRow.appendChild(submit);
    form.appendChild(inputRow);
    form.appendChild(hint);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (answered) return;

      var value = input.value.trim();
      if (!value) {
        input.classList.add('needs-answer');
        input.placeholder = '请先输入单词';
        input.focus();
        return;
      }
      submitTyping(entry, value);
    });
    input.addEventListener('input', function () {
      input.classList.remove('needs-answer');
      state.draft = input.value.slice(0, 80);
    });

    refs.questionArea.replaceChildren(form);
  }

  function normalizeWord(value) {
    return value.normalize('NFC').toLowerCase().replace(/\s+/g, '');
  }

  function submitChoice(entry, selectedMeaning, selectedIndex) {
    if (getAnsweredState(entry)) return;
    recordAnswer(entry, {
      correct: selectedMeaning === entry.meaning,
      selectedMeaning: selectedMeaning,
      selectedIndex: selectedIndex
    });
  }

  function submitTyping(entry, typedValue) {
    if (getAnsweredState(entry)) return;
    var normalized = normalizeWord(typedValue);
    var accepted = entry.accepted.map(normalizeWord);
    recordAnswer(entry, {
      correct: accepted.indexOf(normalized) !== -1,
      typedValue: typedValue
    });
  }

  function recordAnswer(entry, answer) {
    state.draft = '';
    state.answers[entry.id] = answer;
    if (answer.correct) {
      state.correct += 1;
    } else {
      state.wrong += 1;
      addWrongWord(entry.id);
    }
    if (learning) {
      learning.recordAnswer(
        learningProgress,
        dailyStats,
        entry.id,
        answer.correct,
        Date.now()
      );
    }
    render();
  }

  function addWrongWord(id) {
    var previous = wrongWords[id] || {};
    var updated = {
      count: Number(previous.count || 0) + 1,
      lastWrongAt: new Date().toISOString()
    };
    if (previous.addedManuallyAt) {
      updated.addedManuallyAt = previous.addedManuallyAt;
    }
    wrongWords[id] = updated;
    saveWrongWords();
  }

  function renderFeedback(entry, answered) {
    if (!answered) {
      refs.answerFeedback.hidden = true;
      return;
    }

    refs.answerFeedback.hidden = false;
    refs.answerFeedback.classList.toggle('is-correct', answered.correct);
    refs.answerFeedback.classList.toggle('is-wrong', !answered.correct);
    refs.feedbackBadge.textContent = answered.correct ? 'CORRECT' : 'REVIEW';
    refs.feedbackTitle.textContent = answered.correct ? '回答正确' : '已加入错题本';

    if (state.mode === 'typing') {
      refs.feedbackDetail.textContent = answered.correct
        ? entry.word + ' · ' + entry.meaning
        : '正确单词：' + entry.word + '；你的答案：' + answered.typedValue;
    } else {
      refs.feedbackDetail.textContent = entry.word + ' · ' + entry.meaning;
    }
  }

  function speakCurrentWord() {
    var entry = getCurrentEntry();
    var answered = getAnsweredState(entry);
    if (!entry || (state.mode === 'typing' && !answered)) return;

    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
      refs.speakButton.classList.add('is-unavailable');
      refs.speakButton.title = '当前浏览器不支持语音朗读';
      return;
    }

    var speechWord = entry.word.split('/')[0];
    var utterance = new SpeechSynthesisUtterance(speechWord);
    var voices = window.speechSynthesis.getVoices();
    var englishVoice = voices.find(function (voice) {
      return /^en[-_]/i.test(voice.lang);
    });

    utterance.lang = englishVoice ? englishVoice.lang : 'en-US';
    utterance.voice = englishVoice || null;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    refs.speakButton.classList.remove('is-speaking');
    window.requestAnimationFrame(function () {
      refs.speakButton.classList.add('is-speaking');
      window.setTimeout(function () {
        refs.speakButton.classList.remove('is-speaking');
      }, 520);
    });
  }

  function toggleFavorite() {
    var entry = getCurrentEntry();
    if (!entry) return;
    var added = !favorites.has(entry.id);

    if (added) {
      favorites.add(entry.id);
    } else {
      favorites.delete(entry.id);
    }
    updateCollectionControls(entry);
    saveFavorites();
    refreshCollectionDeck();
    showCollectionNotice('favorite', added, entry);
  }

  function toggleWrongWord() {
    var entry = getCurrentEntry();
    if (!entry) return;
    var added = !wrongWords[entry.id];

    if (added) {
      wrongWords[entry.id] = {
        count: 0,
        addedManuallyAt: new Date().toISOString()
      };
      if (learning) {
        learningProgress = learning.seedFromWrongWords(
          learningProgress,
          wrongWords,
          new Set(entryById.keys())
        );
      }
    } else {
      delete wrongWords[entry.id];
    }
    updateCollectionControls(entry);
    saveWrongWords();
    refreshCollectionDeck();
    showCollectionNotice('wrong', added, entry);
  }

  function goNext() {
    var entry = getCurrentEntry();
    if (!entry || !getAnsweredState(entry)) return;

    if (state.position >= state.deck.length - 1) {
      state.completed = true;
    } else {
      state.position += 1;
    }
    state.draft = '';
    render();
  }

  function goPrevious() {
    if (state.completed) {
      state.completed = false;
      state.position = Math.max(0, state.deck.length - 1);
    } else if (state.position > 0) {
      state.position -= 1;
    }
    state.draft = '';
    render();
  }

  function setMode(mode) {
    if (mode !== 'choice' && mode !== 'typing') return;
    state.mode = mode;
    savePreferences();
    resetRound({ scroll: true });
  }

  function setScope(scope) {
    if (['list', 'wrong', 'favorite', 'review'].indexOf(scope) === -1) return;
    state.scope = scope;
    state.wrongShuffle = false;
    state.wrongShuffleLists = 'all';
    state.wrongShuffleRoundId = '';
    state.wrongQuizMode = 'shuffle';
    state.smartLimit = 30;
    state.reviewRoundId = scope === 'review' ? String(Date.now()) : '';
    state.reviewLimit = 20;
    renderListOptions();
    resetRound({ scroll: true });
  }

  function handleKeyboard(event) {
    var target = event.target;
    var tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
    var isFormField = tagName === 'input' || tagName === 'select' || tagName === 'textarea';
    if (isFormField || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'ArrowLeft') {
      goPrevious();
      return;
    }

    if (event.key === 'ArrowRight') {
      goNext();
      return;
    }

    if (state.mode === 'choice' && /^[1-4]$/.test(event.key)) {
      var buttons = refs.questionArea.querySelectorAll('.vocab-choice:not(:disabled)');
      var button = buttons[Number(event.key) - 1];
      if (button) button.click();
    }
  }

  function bindEvents() {
    refs.listSelect.addEventListener('change', function () {
      if (state.scope === 'wrong') {
        state.wrongShuffle = false;
        state.wrongShuffleLists = 'all';
        state.wrongShuffleRoundId = '';
        state.wrongListNumber = refs.listSelect.value === 'all'
          ? 'all'
          : clampListNumber(refs.listSelect.value);
        resetRound({ scroll: true });
        return;
      }
      state.listNumber = clampListNumber(refs.listSelect.value);
      state.scope = 'list';
      savePreferences();
      resetRound({ scroll: true });
    });

    refs.modeSwitcher.addEventListener('click', function (event) {
      var button = event.target.closest('[data-mode]');
      if (button) setMode(button.getAttribute('data-mode'));
    });

    refs.scopeSwitcher.addEventListener('click', function (event) {
      var button = event.target.closest('[data-scope]');
      if (button) setScope(button.getAttribute('data-scope'));
    });

    refs.resetSession.addEventListener('click', function () {
      resetRound({ scroll: true });
    });
    refs.emptyReturnButton.addEventListener('click', function () {
      setScope('list');
    });
    refs.favoriteButton.addEventListener('click', toggleFavorite);
    refs.speakButton.addEventListener('click', speakCurrentWord);
    refs.wrongToggleButton.addEventListener('click', toggleWrongWord);
    refs.previousButton.addEventListener('click', goPrevious);
    refs.nextButton.addEventListener('click', goNext);
    refs.restartButton.addEventListener('click', function () {
      resetRound({ scroll: true });
    });
    document.addEventListener('keydown', handleKeyboard);
    window.addEventListener('pagehide', saveSession);
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) reloadPersistentState();
    });
    window.addEventListener('storage', function (event) {
      var keys = [
        STORAGE_KEYS.favorites,
        STORAGE_KEYS.wrong,
        learning && learning.STORAGE_KEYS.progress,
        learning && learning.STORAGE_KEYS.daily
      ];
      if (keys.indexOf(event.key) !== -1) reloadPersistentState();
    });
  }

  function render() {
    updateControlState();
    var entry = getCurrentEntry();
    updateProgress(entry);
    saveSession();

    if (!state.deck.length) {
      renderEmptyState();
      return;
    }

    if (state.completed) {
      renderSummary();
      return;
    }

    renderQuestion(entry);
  }

  function init() {
    if (!lists.length) {
      var main = document.querySelector('.vocabulary-main');
      if (main) {
        main.innerHTML =
          '<div class="empty-msg">词汇数据加载失败，请刷新页面后重试。</div>';
      }
      return;
    }

    cacheRefs();
    renderListOptions();
    bindEvents();
    if (restoreSession(storedSession)) {
      render();
    } else {
      resetRound();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
