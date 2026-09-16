(() => {
  const key = 'classroom-style-preview';
  let theme = 'modern';
  try { if (localStorage.getItem(key) === 'retro') theme = 'retro'; } catch (_) {}
  document.documentElement.dataset.theme = theme;
  const text = (selector, value) => { const el = document.querySelector(selector); if (el) el.textContent = value; };
  function apply(value, animate) {
    theme = value;
    document.documentElement.dataset.theme = value;
    const retro = value === 'retro';
    text('.landing-label', retro ? 'Classroom Availability Finder' : 'CLASSROOM AVAILABILITY FINDER');
    text('.btn-cta', retro ? '寻找空闲教室' : '启动查询终端');
    text('.page-title', retro ? '寻找一间空闲教室' : '教室课表查询终端');
    text('.landing-footer p', retro ? '留一段时间，安静地读书。' : '教室查询 · 整学期课表');
    const button = document.querySelector('.theme-toggle');
    if (button) {
      const next = retro ? '现代' : '复古';
      button.textContent = next + ' ↔';
      button.setAttribute('aria-label', '当前为' + (retro ? '复古' : '现代') + '风格，切换为' + next + '风格');
      button.title = '切换为' + next + '风格';
    }
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const main = document.querySelector('main');
      main.getAnimations().forEach(animation => animation.cancel());
      main.animate(retro ? [{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}] : [{opacity:.5,transform:'translateX(-6px)'},{opacity:1,transform:'translateX(0)'}], {duration:retro?420:180,easing:'ease-out'});
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    apply(theme, false);
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      apply(theme === 'modern' ? 'retro' : 'modern', true);
      try { localStorage.setItem(key, theme); } catch (_) {}
    });
  });
})();
