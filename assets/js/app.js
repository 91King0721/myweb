/**
 * 空闲教室查询 - 应用逻辑
 */

var DAY_NAMES = ['周一', '周二', '周三', '周四', '周五'];

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
  render();
}

// --- 自动检测当前周（第1周周一 = 2026/3/9）---
function getCurrentWeek() {
  var week1Start = new Date(2026, 2, 9);
  var today = new Date();
  var diffDays = Math.floor((today - week1Start) / (1000 * 60 * 60 * 24));
  var week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(18, week));
}

// --- 获取当前星期名称，周末默认周一 ---
function getCurrentDayName() {
  var idx = new Date().getDay();
  if (idx < 1 || idx > 5) return '周一';
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][idx];
}

// --- 渲染 ---
function render() {
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

    html += '<div class="day-block' + (isExpanded ? ' expanded' : '') + '">';
    html += '<div class="day-header" onclick="toggleDay(\'' + dname + '\')">';
    html += '<span class="day-header-left">';
    html += '<span class="expand-icon">' + (isExpanded ? '▾' : '▸') + '</span>';
    html += '<span class="day-title">' + dname + ' <span class="day-date">' + day.date + '</span></span>';
    html += '</span>';
    html += '<span class="free-info">空闲 <span class="free-num">' + periodFreeRooms.length + '</span><span class="free-sep">/</span><span class="free-total">' + rooms.length + '</span> 间</span>';
    html += '</div>';

    html += '<div class="day-body"' + (isExpanded ? '' : ' style="display:none"') + '>';
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
    html += '</div>';
  }

  if (!html) {
    html = '<div class="empty-msg">没有匹配的教室</div>';
  }

  container.innerHTML = html;
}

// --- 初始化 ---
function init() {
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

  render();
}

init();