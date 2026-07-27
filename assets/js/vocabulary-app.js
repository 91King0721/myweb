/**
 * 考研高频词测试终端
 * - 四选一 / 键入单词
 * - List 1-61 自由切换
 * - 错题本、收藏夹和偏好存储在 localStorage
 * - 使用浏览器 SpeechSynthesis 朗读英文
 */
(function () {
  'use strict';

  var lists = Array.isArray(window.VOCABULARY_LISTS) ? window.VOCABULARY_LISTS : [];
  var STORAGE_KEYS = {
    favorites: 'vocabularyFavoritesV1',
    wrong: 'vocabularyWrongWordsV1',
    preferences: 'vocabularyPreferencesV1'
  };

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
  var preferences = loadPreferences();
  var collectionNoticeTimer = 0;
  var collectionPulseTimer = 0;
  var state = {
    listNumber: clampListNumber(preferences.listNumber || 1),
    mode: preferences.mode === 'typing' ? 'typing' : 'choice',
    scope: getInitialScope(),
    deck: [],
    position: 0,
    answers: Object.create(null),
    correct: 0,
    wrong: 0,
    completed: false
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

  function getInitialScope() {
    try {
      var scope = new URLSearchParams(window.location.search).get('scope');
      return scope === 'wrong' || scope === 'favorite' ? scope : 'list';
    } catch (error) {
      return 'list';
    }
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
    lists.forEach(function (list) {
      var option = document.createElement('option');
      option.value = String(list.list);
      option.textContent = 'List ' + list.list + ' · ' + list.entries.length + ' 词';
      refs.listSelect.appendChild(option);
    });
    refs.listSelect.value = String(state.listNumber);
  }

  function getDeck() {
    if (state.scope === 'wrong') {
      return allEntries.filter(function (entry) {
        return Boolean(wrongWords[entry.id]);
      });
    }

    if (state.scope === 'favorite') {
      return allEntries.filter(function (entry) {
        return favorites.has(entry.id);
      });
    }

    var currentList = listByNumber.get(state.listNumber);
    return currentList ? currentList.entries.map(function (entry) {
      return entryById.get(entry.id);
    }) : [];
  }

  function resetRound(options) {
    var config = options || {};
    state.deck = getDeck();
    state.position = 0;
    state.answers = Object.create(null);
    state.correct = 0;
    state.wrong = 0;
    state.completed = false;
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
    if (state.scope === 'list') {
      render();
      return;
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
    var answeredTotal = state.correct + state.wrong;
    var accuracy = answeredTotal ? Math.round((state.correct / answeredTotal) * 100) + '%' : '--';

    refs.listSelect.value = String(state.listNumber);
    refs.listSelect.disabled = state.scope !== 'list';
    refs.listCount.textContent = state.scope === 'list'
      ? '当前词表共 ' + currentCount + ' 个词'
      : '专项词库覆盖全部 61 个 List';
    refs.currentListCount.textContent = String(currentCount);
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
      ? 'WRONG_BOOK'
      : state.scope === 'favorite'
        ? 'FAVORITES'
        : 'LIST ' + String(state.listNumber).padStart(2, '0');

    refs.quizScopeLabel.textContent = scopeLabel;
    refs.quizProgressText.textContent = current + ' / ' + total;
    refs.quizProgressBar.style.width = percent + '%';
  }

  function renderEmptyState() {
    var isWrongBook = state.scope === 'wrong';
    var isFavorites = state.scope === 'favorite';

    refs.emptyState.hidden = false;
    refs.quizContent.hidden = true;
    refs.quizSummary.hidden = true;

    if (isWrongBook) {
      refs.emptyTitle.textContent = '错题本还是空的';
      refs.emptyDescription.textContent = '答错的词会自动加入这里，方便之后集中复习。';
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
          submitChoice(entry, option.meaning);
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
    });

    refs.questionArea.replaceChildren(form);
  }

  function normalizeWord(value) {
    return value.normalize('NFC').toLowerCase().replace(/\s+/g, '');
  }

  function submitChoice(entry, selectedMeaning) {
    if (getAnsweredState(entry)) return;
    recordAnswer(entry, {
      correct: selectedMeaning === entry.meaning,
      selectedMeaning: selectedMeaning
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
    state.answers[entry.id] = answer;
    if (answer.correct) {
      state.correct += 1;
    } else {
      state.wrong += 1;
      addWrongWord(entry.id);
    }
    render();
  }

  function addWrongWord(id) {
    var previous = wrongWords[id] || {};
    wrongWords[id] = {
      count: Number(previous.count || 0) + 1,
      lastWrongAt: new Date().toISOString()
    };
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
    render();
  }

  function goPrevious() {
    if (state.completed) {
      state.completed = false;
      state.position = Math.max(0, state.deck.length - 1);
    } else if (state.position > 0) {
      state.position -= 1;
    }
    render();
  }

  function setMode(mode) {
    if (mode !== 'choice' && mode !== 'typing') return;
    state.mode = mode;
    savePreferences();
    resetRound({ scroll: true });
  }

  function setScope(scope) {
    if (['list', 'wrong', 'favorite'].indexOf(scope) === -1) return;
    state.scope = scope;
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
  }

  function render() {
    updateControlState();
    var entry = getCurrentEntry();
    updateProgress(entry);

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
    resetRound();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
