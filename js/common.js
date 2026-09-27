/* ===========================================================
   公共脚本：主题、自动扩展输入框、复制、Toast
   =========================================================== */
(function (global) {
  'use strict';

  var THEME_KEY = 'toy-theme';

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    if (saved !== 'light' && saved !== 'dark') {
      saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(saved);
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      });
    }
  }

  /* ---------- 自动高度 ---------- */
  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px'; // CSS max-height 负责封顶
  }

  function initEditors() {
    var areas = document.querySelectorAll('textarea.editor');
    Array.prototype.forEach.call(areas, function (el) {
      var handler = function () { autoGrow(el); updateCount(el); };
      el.addEventListener('input', handler);
      el.addEventListener('paste', function () { setTimeout(handler, 0); });
      handler();
    });
    window.addEventListener('resize', function () {
      Array.prototype.forEach.call(areas, autoGrow);
    });
  }

  function updateCount(el) {
    var target = el.getAttribute('data-count');
    if (!target) return;
    var node = document.getElementById(target);
    if (node) node.textContent = Array.from(el.value).length + ' 字';
  }

  /* ---------- Toast ---------- */
  var toastEl = null, toastTimer = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  /* ---------- 复制 ---------- */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { toast('已复制'); });
    }
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败'); }
      document.body.removeChild(ta);
      resolve();
    });
  }

  /* ---------- 消息条 ---------- */
  function showMsg(id, text, type) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.textContent = text;
    el.className = 'msg show ' + (type || 'err');
  }
  function hideMsg(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.className = 'msg';
    el.textContent = '';
  }

  /* ---------- 取值 / 赋值 ---------- */
  function val(id) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    return el ? el.value : '';
  }
  function setVal(id, v) {
    var el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.value = v;
    autoGrow(el);
    updateCount(el);
  }

  /* ---------- 交换 ---------- */
  function swap(a, b) {
    var ea = typeof a === 'string' ? document.getElementById(a) : a;
    var eb = typeof b === 'string' ? document.getElementById(b) : b;
    if (!ea || !eb) return;
    var t = ea.value;
    setVal(ea, eb.value);
    setVal(eb, t);
  }

  /* ---------- 移动端辅助 ---------- */
  var NARROW = '(max-width: 720px)';

  function isNarrow() {
    return !!(window.matchMedia && window.matchMedia(NARROW).matches);
  }

  /** 窄屏下操作完成后，把结果区域带回视野 */
  function reveal(el) {
    var node = typeof el === 'string' ? document.getElementById(el) : el;
    if (!node || !isNarrow()) return;
    setTimeout(function () {
      var r = node.getBoundingClientRect();
      if (r.top < 8 || r.bottom > window.innerHeight - 12) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }

  /** 软键盘弹出时给 body 打标记，用于收起底部标签栏 */
  function initMobile() {
    if (!window.matchMedia) return;
    document.addEventListener('focusin', function (e) {
      var t = e.target.tagName;
      if (isNarrow() && (t === 'TEXTAREA' || t === 'INPUT')) {
        document.body.classList.add('kb-open');
      }
    });
    document.addEventListener('focusout', function () {
      document.body.classList.remove('kb-open');
    });
  }

  /* ---------- 绑定通用按钮 ---------- */
  function bindCommon() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      btn.addEventListener('click', function () {
        var t = val(btn.getAttribute('data-copy'));
        if (!t) { toast('没有可复制的内容'); return; }
        copy(t);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-clear]'), function (btn) {
      btn.addEventListener('click', function () {
        btn.getAttribute('data-clear').split(',').forEach(function (id) { setVal(id.trim(), ''); });
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-swap]'), function (btn) {
      btn.addEventListener('click', function () {
        var p = btn.getAttribute('data-swap').split(',');
        swap(p[0].trim(), p[1].trim());
      });
    });
  }

  function init() {
    initTheme();
    initEditors();
    bindCommon();
    initMobile();
  }

  global.Toy = {
    init: init,
    autoGrow: autoGrow,
    toast: toast,
    copy: copy,
    showMsg: showMsg,
    hideMsg: hideMsg,
    val: val,
    setVal: setVal,
    swap: swap,
    reveal: reveal,
    isNarrow: isNarrow
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
