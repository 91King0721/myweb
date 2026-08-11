/**
 * 词汇学习进度核心
 * - 艾宾浩斯间隔：1/2/4/7/15/30/60 天
 * - 紧凑数组保存单词熟练度与每日统计，避免占用过多 localStorage
 * - 兼容已有错题数据，不清理或改写原有存储键
 */
(function () {
  'use strict';

  var STORAGE_KEYS = {
    progress: 'vocabularyLearningV1',
    daily: 'vocabularyDailyStatsV1'
  };
  var DAY = 24 * 60 * 60 * 1000;
  var REVIEW_INTERVALS = [
    1 * DAY,
    2 * DAY,
    4 * DAY,
    7 * DAY,
    15 * DAY,
    30 * DAY,
    60 * DAY
  ];
  var MAX_STAGE = REVIEW_INTERVALS.length;
  var MAX_DAILY_RECORDS = 45;

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function clampInteger(value, minimum, maximum) {
    var number = Math.floor(Number(value) || 0);
    return Math.max(minimum, Math.min(maximum, number));
  }

  function normalizeTimestamp(value) {
    var timestamp = Math.floor(Number(value) || 0);
    return timestamp > 0 ? timestamp : 0;
  }

  function getReviewDate(timestamp, interval) {
    var date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + Math.max(1, Math.round(interval / DAY)));
    return date.getTime();
  }

  function normalizeRow(row) {
    var source = Array.isArray(row) ? row : [];
    return [
      clampInteger(source[0], 0, 1000000),
      clampInteger(source[1], 0, 1000000),
      clampInteger(source[2], 0, 1000000),
      clampInteger(source[3], 0, MAX_STAGE),
      clampInteger(source[4], 0, 1000000),
      clampInteger(source[5], 0, 1000000),
      clampInteger(source[6], 0, 1000000),
      normalizeTimestamp(source[7]),
      normalizeTimestamp(source[8]),
      normalizeTimestamp(source[9])
    ];
  }

  function rowToRecord(row) {
    var normalized = normalizeRow(row);
    return {
      attempts: normalized[0],
      correct: normalized[1],
      wrong: normalized[2],
      stage: normalized[3],
      streak: normalized[4],
      lapses: normalized[5],
      reviewAttempts: normalized[6],
      lastReviewedAt: normalized[7],
      nextReviewAt: normalized[8],
      firstSeenAt: normalized[9]
    };
  }

  function recordToRow(record) {
    return normalizeRow([
      record.attempts,
      record.correct,
      record.wrong,
      record.stage,
      record.streak,
      record.lapses,
      record.reviewAttempts,
      record.lastReviewedAt,
      record.nextReviewAt,
      record.firstSeenAt
    ]);
  }

  function loadProgress() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEYS.progress), {});
    if (!stored || Array.isArray(stored) || typeof stored !== 'object') return {};

    var cleaned = {};
    Object.keys(stored).forEach(function (id) {
      if (Array.isArray(stored[id])) cleaned[id] = normalizeRow(stored[id]);
    });
    return cleaned;
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(progress));
    } catch (error) {
      // Learning remains usable when storage is full or unavailable.
    }
  }

  function toLocalDateKey(timestamp) {
    var date = new Date(timestamp === undefined ? Date.now() : timestamp);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function normalizeDailyRow(row) {
    var source = Array.isArray(row) ? row : [];
    return [
      clampInteger(source[0], 0, 1000000),
      clampInteger(source[1], 0, 1000000),
      clampInteger(source[2], 0, 1000000),
      clampInteger(source[3], 0, 1000000)
    ];
  }

  function loadDailyStats() {
    var stored = safeParse(localStorage.getItem(STORAGE_KEYS.daily), {});
    if (!stored || Array.isArray(stored) || typeof stored !== 'object') return {};

    var cleaned = {};
    Object.keys(stored).sort().slice(-MAX_DAILY_RECORDS).forEach(function (dateKey) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey) && Array.isArray(stored[dateKey])) {
        cleaned[dateKey] = normalizeDailyRow(stored[dateKey]);
      }
    });
    return cleaned;
  }

  function saveDailyStats(stats) {
    try {
      var keys = Object.keys(stats).sort();
      keys.slice(0, Math.max(0, keys.length - MAX_DAILY_RECORDS)).forEach(function (key) {
        delete stats[key];
      });
      localStorage.setItem(STORAGE_KEYS.daily, JSON.stringify(stats));
    } catch (error) {
      // Statistics are optional when browser storage is unavailable.
    }
  }

  function getRecord(progress, id) {
    return rowToRecord(progress && progress[id]);
  }

  function seedFromWrongWords(progress, wrongWords, validIds, now) {
    var target = progress && typeof progress === 'object' ? progress : {};
    var source = wrongWords && typeof wrongWords === 'object' ? wrongWords : {};
    var valid = validIds instanceof Set ? validIds : null;
    var timestamp = normalizeTimestamp(now) || Date.now();
    var changed = false;

    Object.keys(source).forEach(function (id) {
      if (target[id] || valid && !valid.has(id)) return;
      var wrongRecord = source[id] && typeof source[id] === 'object' ? source[id] : {};
      var wrongCount = clampInteger(wrongRecord.count, 0, 1000000);
      var lastWrongAt = new Date(
        wrongRecord.lastWrongAt || wrongRecord.addedManuallyAt || timestamp
      ).getTime();
      var seenAt = Number.isFinite(lastWrongAt) ? lastWrongAt : timestamp;

      target[id] = recordToRow({
        attempts: wrongCount,
        correct: 0,
        wrong: wrongCount,
        stage: 0,
        streak: 0,
        lapses: 0,
        reviewAttempts: 0,
        lastReviewedAt: seenAt,
        nextReviewAt: timestamp,
        firstSeenAt: seenAt
      });
      changed = true;
    });

    if (changed) saveProgress(target);
    return target;
  }

  function recordAnswer(progress, dailyStats, entryId, correct, now) {
    var targetProgress = progress && typeof progress === 'object' ? progress : {};
    var targetDaily = dailyStats && typeof dailyStats === 'object' ? dailyStats : {};
    var timestamp = normalizeTimestamp(now) || Date.now();
    var previous = getRecord(targetProgress, entryId);
    var isReview = previous.attempts > 0 || previous.nextReviewAt > 0;
    var wasLearned = previous.correct > 0 || previous.stage > 0;
    var next = Object.assign({}, previous);

    next.attempts += 1;
    next.lastReviewedAt = timestamp;
    next.firstSeenAt = next.firstSeenAt || timestamp;
    if (isReview) next.reviewAttempts += 1;

    if (correct) {
      next.correct += 1;
      next.streak += 1;
      next.stage = Math.min(MAX_STAGE, next.stage + 1);
      next.nextReviewAt = getReviewDate(
        timestamp,
        REVIEW_INTERVALS[Math.max(0, next.stage - 1)]
      );
    } else {
      next.wrong += 1;
      if (isReview && wasLearned) next.lapses += 1;
      next.streak = 0;
      next.stage = 0;
      next.nextReviewAt = getReviewDate(timestamp, REVIEW_INTERVALS[0]);
    }

    targetProgress[entryId] = recordToRow(next);

    var dateKey = toLocalDateKey(timestamp);
    var daily = normalizeDailyRow(targetDaily[dateKey]);
    daily[0] += 1;
    daily[correct ? 1 : 2] += 1;
    if (isReview) daily[3] += 1;
    targetDaily[dateKey] = daily;

    saveProgress(targetProgress);
    saveDailyStats(targetDaily);
    return next;
  }

  function getProficiency(recordOrRow, now) {
    var record = Array.isArray(recordOrRow)
      ? rowToRecord(recordOrRow)
      : recordOrRow && typeof recordOrRow === 'object'
        ? recordOrRow
        : rowToRecord([]);
    if (!record.attempts) return 0;

    var accuracy = record.correct / Math.max(1, record.attempts);
    var stageScore = record.stage / MAX_STAGE * 70;
    var accuracyScore = accuracy * 20;
    var streakScore = Math.min(5, record.streak) / 5 * 10;
    var timestamp = normalizeTimestamp(now) || Date.now();
    var overdueDays = record.nextReviewAt && record.nextReviewAt < timestamp
      ? (timestamp - record.nextReviewAt) / DAY
      : 0;
    var overduePenalty = Math.min(20, overdueDays * 3);

    return Math.max(0, Math.min(100, Math.round(
      stageScore + accuracyScore + streakScore - overduePenalty
    )));
  }

  function getProficiencyLabel(score) {
    if (score >= 80) return '已掌握';
    if (score >= 60) return '熟悉';
    if (score >= 35) return '学习中';
    return '生疏';
  }

  function getDueEntries(entries, progress, now) {
    var timestamp = normalizeTimestamp(now) || Date.now();
    return entries.filter(function (entry) {
      var record = getRecord(progress, entry.id);
      return record.nextReviewAt > 0 && record.nextReviewAt <= timestamp;
    }).sort(function (left, right) {
      return getRecord(progress, left.id).nextReviewAt -
        getRecord(progress, right.id).nextReviewAt;
    });
  }

  function getScheduledTodayEntries(entries, progress, now) {
    var timestamp = normalizeTimestamp(now) || Date.now();
    var end = new Date(timestamp);
    end.setHours(23, 59, 59, 999);
    return entries.filter(function (entry) {
      var nextReviewAt = getRecord(progress, entry.id).nextReviewAt;
      return nextReviewAt > 0 && nextReviewAt <= end.getTime();
    });
  }

  function getForgettingRate(progress) {
    var lapses = 0;
    var reviewAttempts = 0;

    Object.keys(progress || {}).forEach(function (id) {
      var record = getRecord(progress, id);
      lapses += record.lapses;
      reviewAttempts += record.reviewAttempts;
    });
    return reviewAttempts ? Math.round(lapses / reviewAttempts * 100) : 0;
  }

  function getTodayStats(dailyStats, now) {
    var row = normalizeDailyRow((dailyStats || {})[toLocalDateKey(now)]);
    return {
      answered: row[0],
      correct: row[1],
      wrong: row[2],
      reviewed: row[3],
      accuracy: row[0] ? Math.round(row[1] / row[0] * 100) : 0
    };
  }

  function getDailySeries(dailyStats, days, now) {
    var count = Math.max(1, Math.min(31, Math.floor(Number(days) || 7)));
    var timestamp = normalizeTimestamp(now) || Date.now();
    var result = [];

    for (var offset = count - 1; offset >= 0; offset -= 1) {
      var date = new Date(timestamp);
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      var row = normalizeDailyRow((dailyStats || {})[toLocalDateKey(date.getTime())]);
      result.push({
        dateKey: toLocalDateKey(date.getTime()),
        label: (date.getMonth() + 1) + '/' + date.getDate(),
        answered: row[0],
        correct: row[1],
        wrong: row[2],
        reviewed: row[3],
        accuracy: row[0] ? Math.round(row[1] / row[0] * 100) : 0
      });
    }
    return result;
  }

  function getListMastery(lists, progress, now) {
    return lists.map(function (list) {
      var learned = 0;
      var mastered = 0;
      var scoreTotal = 0;

      list.entries.forEach(function (entry) {
        var record = getRecord(progress, entry.id);
        var score = getProficiency(record, now);
        if (record.attempts > 0 || record.nextReviewAt > 0) learned += 1;
        if (score >= 80) mastered += 1;
        scoreTotal += score;
      });

      return {
        list: list.list,
        total: list.entries.length,
        learned: learned,
        mastered: mastered,
        masteryRate: list.entries.length
          ? Math.round(mastered / list.entries.length * 100)
          : 0,
        averageProficiency: list.entries.length
          ? Math.round(scoreTotal / list.entries.length)
          : 0
      };
    });
  }

  function getNextIntervalLabel(stage) {
    var normalizedStage = clampInteger(stage, 0, MAX_STAGE);
    var interval = REVIEW_INTERVALS[Math.max(0, normalizedStage - 1)];
    return Math.round(interval / DAY) + ' 天';
  }

  window.VocabularyLearning = {
    STORAGE_KEYS: STORAGE_KEYS,
    REVIEW_INTERVALS: REVIEW_INTERVALS.slice(),
    MAX_STAGE: MAX_STAGE,
    loadProgress: loadProgress,
    saveProgress: saveProgress,
    loadDailyStats: loadDailyStats,
    saveDailyStats: saveDailyStats,
    seedFromWrongWords: seedFromWrongWords,
    recordAnswer: recordAnswer,
    getRecord: getRecord,
    getProficiency: getProficiency,
    getProficiencyLabel: getProficiencyLabel,
    getDueEntries: getDueEntries,
    getScheduledTodayEntries: getScheduledTodayEntries,
    getForgettingRate: getForgettingRate,
    getTodayStats: getTodayStats,
    getDailySeries: getDailySeries,
    getListMastery: getListMastery,
    getNextIntervalLabel: getNextIntervalLabel,
    toLocalDateKey: toLocalDateKey
  };
})();
