/**
 * 学习进度中心
 * - 今日艾宾浩斯复习与单词熟练度
 * - 每日统计、遗忘率、7 天曲线与 List 掌握率
 * - 高频错词专项和按错误次数加权抽题入口
 */
(function () {
  'use strict';

  var lists = Array.isArray(window.VOCABULARY_LISTS) ? window.VOCABULARY_LISTS : [];
  var learning = window.VocabularyLearning;
  var WRONG_KEY = 'vocabularyWrongWordsV1';
  var allEntries = [];
  var validIds = new Set();
  var refs = {};
  var progress = {};
  var dailyStats = {};
  var wrongWords = {};

  lists.forEach(function (list) {
    list.entries.forEach(function (entry) {
      var enriched = Object.assign({ list: list.list }, entry);
      allEntries.push(enriched);
      validIds.add(enriched.id);
    });
  });

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function loadState() {
    progress = learning.loadProgress();
    dailyStats = learning.loadDailyStats();
    var storedWrong = safeParse(localStorage.getItem(WRONG_KEY), {});
    wrongWords = storedWrong && !Array.isArray(storedWrong) && typeof storedWrong === 'object'
      ? storedWrong
      : {};
    progress = learning.seedFromWrongWords(progress, wrongWords, validIds);
  }

  function cacheRefs() {
    [
      'reviewLaunchForm', 'reviewCtaCount', 'reviewLimit', 'reviewAllButton',
      'startReviewButton', 'dueNowCount', 'learnedCount',
      'averageProficiency', 'forgettingRate', 'todayDate', 'todayAnswered',
      'todayCorrect', 'todayWrong', 'todayAccuracy', 'todayReviewed',
      'highFrequencyLink', 'highFrequencyCount', 'weightedQuizForm',
      'smartQuizLimit', 'smartQuizButton', 'weeklyChart', 'scheduledTodayCount',
      'reviewQueue', 'reviewQueueEmpty', 'listMasteryGrid'
    ].forEach(function (id) {
      refs[id] = document.getElementById(id);
    });
  }

  function createRoundId() {
    return Date.now().toString(36) +
      Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0');
  }

  function setDisabledLink(link, disabled) {
    link.classList.toggle('is-disabled', disabled);
    link.setAttribute('aria-disabled', String(disabled));
    link.tabIndex = disabled ? -1 : 0;
  }

  function renderSummary(now) {
    var dueEntries = learning.getDueEntries(allEntries, progress, now);
    var scheduledToday = learning.getScheduledTodayEntries(allEntries, progress, now);
    var learnedRows = Object.keys(progress).filter(function (id) {
      if (!validIds.has(id)) return false;
      var record = learning.getRecord(progress, id);
      return record.attempts > 0 || record.nextReviewAt > 0;
    });
    var proficiencyTotal = learnedRows.reduce(function (total, id) {
      return total + learning.getProficiency(progress[id], now);
    }, 0);
    var highCount = Object.keys(wrongWords).filter(function (id) {
      return validIds.has(id) && Number(wrongWords[id] && wrongWords[id].count || 0) >= 3;
    }).length;

    refs.dueNowCount.textContent = String(dueEntries.length);
    refs.reviewCtaCount.textContent = String(dueEntries.length);
    refs.learnedCount.textContent = String(learnedRows.length);
    refs.averageProficiency.textContent = String(
      learnedRows.length ? Math.round(proficiencyTotal / learnedRows.length) : 0
    );
    refs.forgettingRate.textContent = String(learning.getForgettingRate(progress));
    refs.highFrequencyCount.textContent = String(highCount);
    refs.scheduledTodayCount.textContent = scheduledToday.length + ' 词';

    refs.reviewLimit.max = String(Math.max(1, dueEntries.length));
    if (dueEntries.length && (
      Number(refs.reviewLimit.value) < 1 || Number(refs.reviewLimit.value) > dueEntries.length
    )) {
      refs.reviewLimit.value = String(Math.min(20, dueEntries.length));
    }
    refs.reviewLimit.disabled = dueEntries.length === 0;
    refs.reviewAllButton.disabled = dueEntries.length === 0;
    refs.startReviewButton.disabled = dueEntries.length === 0;
    refs.highFrequencyLink.href =
      'vocabulary.html?scope=wrong&shuffle=1&wrongLists=all&wrongMode=high&round=' +
      createRoundId();
    setDisabledLink(refs.highFrequencyLink, highCount === 0);

    renderReviewQueue(dueEntries, now);
  }

  function renderTodayStats(now) {
    var stats = learning.getTodayStats(dailyStats, now);
    var date = new Date(now);
    refs.todayDate.textContent = date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      weekday: 'short'
    });
    refs.todayDate.dateTime = learning.toLocalDateKey(now);
    refs.todayAnswered.textContent = String(stats.answered);
    refs.todayCorrect.textContent = String(stats.correct);
    refs.todayWrong.textContent = String(stats.wrong);
    refs.todayAccuracy.textContent = String(stats.accuracy);
    refs.todayReviewed.textContent = String(stats.reviewed);
  }

  function renderReviewQueue(entries, now) {
    refs.reviewQueue.replaceChildren();
    refs.reviewQueueEmpty.hidden = entries.length > 0;

    entries.slice(0, 12).forEach(function (entry) {
      var record = learning.getRecord(progress, entry.id);
      var score = learning.getProficiency(record, now);
      var item = document.createElement('article');
      var copy = document.createElement('div');
      var word = document.createElement('strong');
      var meta = document.createElement('span');
      var proficiency = document.createElement('b');

      word.textContent = entry.word;
      meta.textContent = 'List ' + String(entry.list).padStart(2, '0') +
        ' · 错 ' + record.wrong + ' 次';
      proficiency.textContent = learning.getProficiencyLabel(score) + ' · ' + score + '%';
      proficiency.className = 'is-level-' + (
        score >= 80 ? 'mastered' : score >= 60 ? 'familiar' : score >= 35 ? 'learning' : 'weak'
      );

      copy.appendChild(word);
      copy.appendChild(meta);
      item.appendChild(copy);
      item.appendChild(proficiency);
      refs.reviewQueue.appendChild(item);
    });

    if (entries.length > 12) {
      var more = document.createElement('p');
      more.className = 'learning-queue-more';
      more.textContent = '另有 ' + (entries.length - 12) + ' 个到期单词，将在测试中继续出现。';
      refs.reviewQueue.appendChild(more);
    }
  }

  function renderWeeklyChart(now) {
    var series = learning.getDailySeries(dailyStats, 7, now);
    var width = 720;
    var height = 250;
    var left = 38;
    var right = 16;
    var top = 24;
    var bottom = 42;
    var chartWidth = width - left - right;
    var chartHeight = height - top - bottom;
    var maximum = Math.max(5, series.reduce(function (max, day) {
      return Math.max(max, day.answered);
    }, 0));

    function point(day, index, key) {
      var x = left + chartWidth * index / Math.max(1, series.length - 1);
      var y = top + chartHeight - day[key] / maximum * chartHeight;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    var answeredPoints = series.map(function (day, index) {
      var value = point(day, index, 'answered');
      return value.x + ',' + value.y;
    }).join(' ');
    var correctPoints = series.map(function (day, index) {
      var value = point(day, index, 'correct');
      return value.x + ',' + value.y;
    }).join(' ');
    var labels = series.map(function (day, index) {
      var value = point(day, index, 'answered');
      return '<text x="' + value.x + '" y="232" text-anchor="middle">' + day.label + '</text>' +
        '<circle class="is-answered-point" cx="' + value.x + '" cy="' + value.y + '" r="4" />';
    }).join('');

    refs.weeklyChart.innerHTML =
      '<svg viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true" focusable="false">' +
        '<line class="learning-chart-axis" x1="' + left + '" y1="' + (top + chartHeight) +
          '" x2="' + (width - right) + '" y2="' + (top + chartHeight) + '" />' +
        '<line class="learning-chart-grid" x1="' + left + '" y1="' + top +
          '" x2="' + (width - right) + '" y2="' + top + '" />' +
        '<text class="learning-chart-maximum" x="4" y="' + (top + 4) + '">' + maximum + '</text>' +
        '<polyline class="learning-chart-line is-answered" points="' + answeredPoints + '" />' +
        '<polyline class="learning-chart-line is-correct" points="' + correctPoints + '" />' +
        labels +
      '</svg>';
    refs.weeklyChart.setAttribute(
      'aria-label',
      '最近 7 天共答题 ' + series.reduce(function (total, day) {
        return total + day.answered;
      }, 0) + ' 次'
    );
  }

  function renderListMastery(now) {
    var mastery = learning.getListMastery(lists, progress, now);
    var fragment = document.createDocumentFragment();

    mastery.forEach(function (item) {
      var card = document.createElement('article');
      var heading = document.createElement('div');
      var title = document.createElement('strong');
      var rate = document.createElement('b');
      var track = document.createElement('span');
      var fill = document.createElement('i');
      var meta = document.createElement('small');

      card.className = 'learning-mastery-card';
      title.textContent = 'List ' + String(item.list).padStart(2, '0');
      rate.textContent = item.masteryRate + '%';
      fill.style.width = item.masteryRate + '%';
      meta.textContent = '已学 ' + item.learned + '/' + item.total +
        ' · 已掌握 ' + item.mastered + ' · 平均熟练度 ' + item.averageProficiency + '%';

      heading.appendChild(title);
      heading.appendChild(rate);
      track.appendChild(fill);
      card.appendChild(heading);
      card.appendChild(track);
      card.appendChild(meta);
      fragment.appendChild(card);
    });
    refs.listMasteryGrid.replaceChildren(fragment);
  }

  function render() {
    var now = Date.now();
    renderSummary(now);
    renderTodayStats(now);
    renderWeeklyChart(now);
    renderListMastery(now);
    refs.smartQuizButton.disabled = Object.keys(wrongWords).filter(function (id) {
      return validIds.has(id);
    }).length === 0;
  }

  function bindEvents() {
    refs.reviewAllButton.addEventListener('click', function () {
      var dueCount = Math.max(0, Number(refs.reviewCtaCount.textContent) || 0);
      if (dueCount) refs.reviewLimit.value = String(dueCount);
    });
    refs.reviewLaunchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (refs.startReviewButton.disabled) return;
      var dueCount = Math.max(1, Number(refs.reviewCtaCount.textContent) || 1);
      var limit = Math.max(1, Math.min(dueCount, Math.floor(Number(refs.reviewLimit.value) || 20)));
      window.location.href = 'vocabulary.html?scope=review&limit=' + limit +
        '&round=' + createRoundId();
    });
    refs.highFrequencyLink.addEventListener('click', function (event) {
      if (refs.highFrequencyLink.classList.contains('is-disabled')) event.preventDefault();
    });
    refs.weightedQuizForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (refs.smartQuizButton.disabled) return;
      window.location.href =
        'vocabulary.html?scope=wrong&shuffle=1&wrongLists=all&wrongMode=weighted&limit=' +
        encodeURIComponent(refs.smartQuizLimit.value) + '&round=' + createRoundId();
    });
    window.addEventListener('storage', function (event) {
      if ([WRONG_KEY, learning.STORAGE_KEYS.progress, learning.STORAGE_KEYS.daily]
        .indexOf(event.key) === -1) return;
      loadState();
      render();
    });
    window.addEventListener('pageshow', function () {
      loadState();
      render();
    });
  }

  function init() {
    cacheRefs();
    if (!lists.length || !learning) {
      document.querySelector('.learning-main').innerHTML =
        '<div class="empty-msg">学习数据加载失败，请刷新页面后重试。</div>';
      return;
    }
    loadState();
    bindEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
