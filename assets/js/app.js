/**
 * 空闲教室查询 - 应用逻辑
 */

var DAY_NAMES = DATA_META.dayNames;

// --- 时间段分组 ---
var PERIOD_GROUPS = {
  'all': { periods: [1,2,3,4,5,6,7,8,9,10,11,12] },
  '1-4': { periods: [1,2,3,4] },
  '5-8': { periods: [5,6,7,8] },
  '9-12': { periods: [9,10,11,12] }
};

// --- 收藏管理 (localStorage) ---
var FAV_STORAGE_KEY = 'classroomFavorites';

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favs));
}

function toggleFavorite(building, roomName) {
  var favs = getFavorites();
  var key = building + '|' + roomName;
  var idx = favs.indexOf(key);
  if (idx === -1) {
    favs.push(key);
  } else {
    favs.splice(idx, 1);
  }
  saveFavorites(favs);
  return idx === -1;
}

// --- 收藏过滤状态 ---
var showFavsOnly = false;

function toggleFavFilter() {
  showFavsOnly = !showFavsOnly;
  var btn = document.getElementById('favToggle');
  if (btn) btn.classList.toggle('active', showFavsOnly);
  render();
}

// --- 时段过滤辅助 ---
function isRoomFreeInPeriods(room, periodNums) {
  for (var i = 0; i < periodNums.length; i++) {
    if (room.periods[periodNums[i] - 1]) return false;
  }
  return true;
}

// --- 自定义时段切换 ---
function onPeriodChange() {
  var sel = document.getElementById('periodSel');
  var customRange = document.getElementById('customRange');
  customRange.style.display = (sel.value === 'custom') ? 'flex' : 'none';
  render();
}

// --- 折叠展开 ---
var expandedDay = null;

function toggleDay(dayName) {
  expandedDay = (expandedDay === dayName) ? null : dayName;
  render({ scrollToExpanded: true });
}

// --- 按教务系统学期起始日期和北京时间计算周次 ---
function getBeijingDateParts() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce(function(parts, part) {
    parts[part.type] = part.value;
    return parts;
  }, {});
}

function getCurrentWeek() {
  var parts = getBeijingDateParts();
  var today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  var week1Start = Date.parse(DATA_META.week1Start + 'T00:00:00Z');
  var week = Math.floor((today - week1Start) / (7 * 86400000)) + 1;
  return Math.max(1, Math.min(DATA_META.weekCount, week));
}

function getCurrentDayName() {
  var parts = getBeijingDateParts();
  var day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
  return DAY_NAMES[(day + 6) % 7];
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

var resultsRefreshFrame = null;
var resultsRefreshTimer = null;

function scheduleResultsRefresh(container) {
  if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (resultsRefreshFrame) window.cancelAnimationFrame(resultsRefreshFrame);
  if (resultsRefreshTimer) window.clearTimeout(resultsRefreshTimer);

  container.classList.remove('results-updating');
  resultsRefreshFrame = window.requestAnimationFrame(function() {
    resultsRefreshFrame = window.requestAnimationFrame(function() {
      container.classList.add('results-updating');
      resultsRefreshTimer = window.setTimeout(function() {
        container.classList.remove('results-updating');
        resultsRefreshTimer = null;
      }, 520);
      resultsRefreshFrame = null;
    });
  });
}

function renderDayBody(periodFreeRooms, activePeriods, bld, favKeys) {
  var html = '<div class="day-body">';
  html += '<div class="table-wrap"><table>';
  html += '<tr><th class="room-name">教室</th><th class="seat-th">座位</th>';

  for (var pi = 0; pi < activePeriods.length; pi++) {
    var p = activePeriods[pi];
    var t = PERIODS[String(p)].substring(0, 5);
    html += '<th class="period">' + p + '<span class="period-time">' + t + '</span></th>';
  }
  html += '</tr>';

  for (var j = 0; j < periodFreeRooms.length; j++) {
    var r = periodFreeRooms[j];
    var roomKey = bld + '|' + r.name;
    var isFav = favKeys.indexOf(roomKey) !== -1;

    var starSvg = isFav
      ? '<svg class="fav-star filled" viewBox="0 0 24 24" width="14" height="14" data-building="' + bld + '" data-room="' + r.name + '"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" fill="currentColor" stroke="currentColor" stroke-width="1"/></svg>'
      : '<svg class="fav-star" viewBox="0 0 24 24" width="14" height="14" data-building="' + bld + '" data-room="' + r.name + '"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

    html += '<tr class="' + (isFav ? 'fav-row' : '') + '">';
    html += '<td class="room-name">' + starSvg + '<span class="room-text">' + r.name + '</span><span class="room-seats-mobile">' + r.seats + '座</span></td>';
    html += '<td class="seat-td">' + r.seats + '</td>';
    for (var k = 0; k < activePeriods.length; k++) {
      var periodIdx = activePeriods[k] - 1;
      var cls = r.periods[periodIdx] ? 'occ' : 'free';
      html += '<td class="' + cls + '"><span class="' + cls + '-mark"></span></td>';
    }
    html += '</tr>';
  }

  html += '</table></div>';
  html += '</div>';
  return html;
}

function scrollExpandedDayIntoView(container) {
  if (!container || !expandedDay || !isMobileViewport()) return;

  window.requestAnimationFrame(function() {
    var blocks = container.querySelectorAll('.day-block[data-day]');
    var target = null;
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].getAttribute('data-day') === expandedDay) {
        target = blocks[i];
        break;
      }
    }
    if (!target) return;

    var navOffset = 70;
    var rect = target.getBoundingClientRect();
    if (rect.top >= navOffset && rect.top < window.innerHeight * 0.72) return;

    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - navOffset),
      behavior: 'auto'
    });
  });
}

// --- 渲染 ---
function render(options) {
  var week = document.getElementById('weekSel').value;
  var bld = document.getElementById('bldSel').value;
  var query = document.getElementById('searchInput').value.trim();
  var periodGroup = document.getElementById('periodSel').value;

  var container = document.getElementById('results');
  var wdata = DATA[week];
  if (!wdata || !wdata[bld]) {
    container.innerHTML = '<div class="empty-msg">暂无数据</div>';
    return;
  }

  var activePeriods;
  var isAllPeriods;

  if (periodGroup === 'custom') {
    var s = parseInt(document.getElementById('periodStart').value, 10);
    var e = parseInt(document.getElementById('periodEnd').value, 10);
    var start = Math.min(s, e);
    var end = Math.max(s, e);
    activePeriods = [];
    for (var p = start; p <= end; p++) activePeriods.push(p);
    isAllPeriods = false;
  } else {
    activePeriods = PERIOD_GROUPS[periodGroup].periods;
    isAllPeriods = (periodGroup === 'all');
  }
  var favKeys = getFavorites();
  var days = wdata[bld];
  var html = '';
  var dayBlockIndex = 0;

  for (var i = 0; i < DAY_NAMES.length; i++) {
    var dname = DAY_NAMES[i];
    var day = days[dname];
    if (!day) continue;

    // 1. 文本搜索过滤
    var rooms = day.rooms;
    if (query) {
      rooms = rooms.filter(function(r) {
        return r.name.indexOf(query) !== -1;
      });
    }

    // 2. 收藏过滤
    if (showFavsOnly) {
      rooms = rooms.filter(function(r) {
        return favKeys.indexOf(bld + '|' + r.name) !== -1;
      });
    }
    if (rooms.length === 0) continue;

    // 3. 时段过滤
    var periodFreeRooms = rooms;
    if (!isAllPeriods) {
      periodFreeRooms = rooms.filter(function(r) {
        return isRoomFreeInPeriods(r, activePeriods);
      });
    }
    if (periodFreeRooms.length === 0) continue;

    var isExpanded = (expandedDay === dname);

    html += '<div class="day-block' + (isExpanded ? ' expanded' : '') + '" data-day="' + dname + '" style="--block-index:' + dayBlockIndex + '">';
    dayBlockIndex++;
    html += '<div class="day-header" onclick="toggleDay(\'' + dname + '\')">';
    html += '<span class="day-header-left">';
    html += '<span class="expand-icon">' + (isExpanded ? '▾' : '▸') + '</span>';
    html += '<span class="day-title">' + dname + ' <span class="day-date">' + day.date + '</span></span>';
    html += '</span>';
    var freeCount = isAllPeriods ? rooms.filter(function(r) { return r.periods.some(function(p) { return p === 0; }); }).length : periodFreeRooms.length;
    html += '<span class="free-info">' + (isAllPeriods ? '有空闲' : '所选时段空闲') + ' <span class="free-num">' + freeCount + '</span><span class="free-sep">/</span><span class="free-total">' + rooms.length + '</span> 间</span>';
    html += '</div>';

    if (isExpanded) {
      html += renderDayBody(periodFreeRooms, activePeriods, bld, favKeys);
    }

    html += '</div>';
  }

  if (!html) {
    html = '<div class="empty-msg">没有匹配的教室</div>';
  }

  container.innerHTML = html;
  scheduleResultsRefresh(container);
  if (options && options.scrollToExpanded) {
    scrollExpandedDayIntoView(container);
  }
}

// --- 初始化 ---
function init() {
  if (!document.getElementById('weekSel') || typeof DATA === 'undefined') return;

  // 教学楼和数据说明直接来自本次下载元信息。
  var bldSel = document.getElementById('bldSel');
  bldSel.textContent = '';
  DATA_META.buildings.forEach(function(name) {
    var option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    bldSel.appendChild(option);
  });
  var updated = new Date(DATA_META.updatedAt).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false
  });
  document.getElementById('dataStatus').textContent = DATA_META.semesterLabel + ' · ' + DATA_META.campus +
    ' · 第 1–' + DATA_META.weekCount + ' 周 · 周一至周日 · 更新：' + updated + '（北京时间）';

  // 自动选择当前周
  var weekSel = document.getElementById('weekSel');
  weekSel.value = String(getCurrentWeek());

  // 默认展开今天
  expandedDay = getCurrentDayName();

  // 事件委托：收藏星标
  document.getElementById('results').addEventListener('click', function(e) {
    var star = e.target.closest('.fav-star');
    if (star) {
      var building = star.getAttribute('data-building');
      var roomName = star.getAttribute('data-room');
      toggleFavorite(building, roomName);
      render();
    }
  });

  render({ scrollToExpanded: true });
}

init();
