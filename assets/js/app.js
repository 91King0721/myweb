/**
 * 空闲教室查询 - 应用逻辑
 */
function render() {
  var week = document.getElementById('weekSel').value;
  var bld = document.getElementById('bldSel').value;
  var query = document.getElementById('searchInput').value.trim();

  var container = document.getElementById('results');
  var wdata = DATA[week];
  if (!wdata || !wdata[bld]) {
    container.innerHTML = '<div class="empty-msg">暂无数据</div>';
    return;
  }

  var days = wdata[bld];
  var html = '';

  var dayOrder = ['周一', '周二', '周三', '周四', '周五'];
  for (var i = 0; i < dayOrder.length; i++) {
    var dname = dayOrder[i];
    var day = days[dname];
    if (!day) continue;

    var rooms = day.rooms;
    if (query) {
      rooms = rooms.filter(function(r) {
        return r.name.indexOf(query) !== -1;
      });
    }
    if (rooms.length === 0) continue;

    html += '<div class="day-block">';
    html += '<div class="day-header">';
    html += '<span class="day-title">' + dname + ' <span class="day-date">' + day.date + '</span></span>';
    html += '<span class="free-info">空闲 <span class="free-num">' + day.free + '</span><span class="free-sep">/</span><span class="free-total">' + day.total + '</span> 间</span>';
    html += '</div>';
    html += '<div class="table-wrap"><table>';
    html += '<tr><th class="room-name">教室</th><th class="seat-th">座位</th>';
    for (var p = 1; p <= 12; p++) {
      var t = PERIODS[String(p)].substring(0, 5);
      html += '<th class="period">' + p + '<span class="period-time">' + t + '</span></th>';
    }
    html += '</tr>';

    for (var j = 0; j < rooms.length; j++) {
      var r = rooms[j];
      html += '<tr>';
      html += '<td class="room-name"><span class="room-text">' + r.name + '</span><span class="room-seats-mobile">' + r.seats + '座</span></td>';
      html += '<td class="seat-td">' + r.seats + '</td>';
      for (var k = 0; k < r.periods.length; k++) {
        var cls = r.periods[k] ? 'occ' : 'free';
        html += '<td class="' + cls + '">' + (r.periods[k] ? '—' : '○') + '</td>';
      }
      html += '</tr>';
    }

    html += '</table></div>';
    html += '</div>';
  }

  if (!html) {
    html = '<div class="empty-msg">没有匹配的教室</div>';
  }

  container.innerHTML = html;
}

render();
