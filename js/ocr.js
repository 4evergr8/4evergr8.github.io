/* ===========================================================
   OCR：tesseract.js v5，本地识别，图片不出浏览器
   =========================================================== */
(function () {
  'use strict';

  var fileEl = document.getElementById('file');
  var dropEl = document.getElementById('drop');
  var shotWrap = document.getElementById('shotWrap');
  var shotEl = document.getElementById('shot');
  var outEl = document.getElementById('out');
  var statusEl = document.getElementById('status');
  var progWrap = document.getElementById('progWrap');
  var progBar = document.getElementById('progBar');
  var runBtn = document.getElementById('run');

  var langs = 'chi_sim+eng';
  var tidyMode = 'raw';
  var source = null;   // File / Blob
  var objectUrl = null;
  var busy = false;
  var worker = null;

  /* ---------- 分段控件 ---------- */
  function bindSeg(id, cb) {
    var box = document.getElementById(id);
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
        b.classList.toggle('on', b === btn);
      });
      cb(btn.getAttribute('data-v'));
    });
  }
  bindSeg('lang', function (v) { langs = v; });
  bindSeg('tidy', function (v) { tidyMode = v; });

  /* ---------- 状态 / 进度 ---------- */
  var STATUS_TEXT = {
    'loading tesseract core': '加载识别引擎',
    'initializing tesseract': '初始化引擎',
    'loading language traineddata': '下载语言模型',
    'initializing api': '准备识别',
    'recognizing text': '识别中'
  };

  function setStatus(text, spinning) {
    statusEl.innerHTML = '';
    if (spinning) {
      var s = document.createElement('span');
      s.className = 'spin';
      statusEl.appendChild(s);
    }
    var span = document.createElement('span');
    span.textContent = text;
    statusEl.appendChild(span);
  }

  function setProgress(p) {
    var v = Math.max(0, Math.min(1, p || 0));
    progBar.style.width = (v * 100).toFixed(1) + '%';
    var pct = statusEl.querySelector('.pct');
    if (pct) pct.textContent = Math.round(v * 100) + '%';
  }

  function showProgress(on) {
    progWrap.style.display = on ? 'block' : 'none';
    if (!on) progBar.style.width = '0%';
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ---------- 载入图片 ---------- */
  function useImage(blob, name) {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    source = blob;
    objectUrl = URL.createObjectURL(blob);
    shotEl.src = objectUrl;
    shotWrap.style.display = 'flex';

    document.getElementById('fName').textContent = name || '剪贴板图片';
    document.getElementById('fBytes').textContent = fmtBytes(blob.size || 0);
    document.getElementById('fSize').textContent = '—';
    var img = new Image();
    img.onload = function () {
      document.getElementById('fSize').textContent = img.naturalWidth + ' × ' + img.naturalHeight;
    };
    img.src = objectUrl;

    Toy.hideMsg('msg');
    setStatus('图片已就绪，点「开始识别」');
    Toy.reveal(outEl);
  }

  fileEl.addEventListener('change', function () {
    var f = fileEl.files && fileEl.files[0];
    if (f) useImage(f, f.name);
    fileEl.value = '';   // 允许再次选同一个文件时也能触发 change
  });

  /* 注意：input 在 drop 内部，click 会冒泡回来，必须排除自身否则会无限递归 */
  dropEl.addEventListener('click', function (e) {
    if (e.target === fileEl) return;
    fileEl.click();
  });
  dropEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); }
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) {
      e.preventDefault();
      dropEl.classList.add('over');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) {
      e.preventDefault();
      dropEl.classList.remove('over');
    });
  });
  dropEl.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) useImage(f, f.name);
    else Toy.showMsg('msg', '请拖入图片文件');
  });

  /* 整页粘贴：Ctrl/Cmd + V 直接贴图片 */
  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { useImage(f, '粘贴的图片'); e.preventDefault(); }
        return;
      }
    }
  });

  document.getElementById('paste').addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      Toy.showMsg('msg', '当前浏览器不支持读取剪贴板，请用 Ctrl / Cmd + V 粘贴');
      return;
    }
    navigator.clipboard.read().then(function (items) {
      for (var i = 0; i < items.length; i++) {
        var types = items[i].types || [];
        for (var j = 0; j < types.length; j++) {
          if (types[j].indexOf('image/') === 0) {
            return items[i].getType(types[j]).then(function (blob) {
              useImage(blob, '剪贴板图片');
            });
          }
        }
      }
      Toy.showMsg('msg', '剪贴板里没有图片');
    }).catch(function () {
      Toy.showMsg('msg', '读取剪贴板失败，请用 Ctrl / Cmd + V 粘贴');
    });
  });

  /* ---------- 输出处理 ---------- */
  function tidy(text) {
    if (tidyMode === 'strip') return text.replace(/[\s\u3000]+/g, '');
    if (tidyMode === 'compact') {
      return text.replace(/[\t\r\u3000]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    return text.replace(/\r\n/g, '\n').trim();
  }

  /* ---------- 识别 ---------- */
  function run() {
    if (busy) return;
    if (!source) { Toy.showMsg('msg', '先选一张图片'); return; }
    if (typeof Tesseract === 'undefined') {
      Toy.showMsg('msg', '识别引擎加载失败，请检查网络后刷新页面');
      return;
    }

    busy = true;
    runBtn.setAttribute('disabled', '');
    Toy.hideMsg('msg');
    showProgress(true);
    setStatus('准备中', true);
    var pct = document.createElement('span');
    pct.className = 'pct';
    statusEl.appendChild(pct);

    Tesseract.createWorker(langs, 1, {
      logger: function (m) {
        var label = STATUS_TEXT[m.status] || m.status || '处理中';
        setStatus(label, true);
        var p = statusEl.querySelector('.pct');
        if (!p) { p = document.createElement('span'); p.className = 'pct'; statusEl.appendChild(p); }
        p.textContent = Math.round((m.progress || 0) * 100) + '%';
        setProgress(m.progress);
      }
    }).then(function (w) {
      worker = w;
      return w.recognize(source);
    }).then(function (res) {
      var text = tidy((res && res.data && res.data.text) || '');
      Toy.setVal(outEl, text);
      if (text) {
        setStatus('识别完成，共 ' + Array.from(text).length + ' 字');
        Toy.reveal(outEl);
      } else {
        setStatus('完成，但没有识别出文字');
        Toy.showMsg('msg', '没有识别出文字，试试换一种语言或换张更清晰的图');
      }
    }).catch(function (err) {
      console.error(err);
      setStatus('识别失败');
      Toy.showMsg('msg', '识别失败：' + (err && err.message ? err.message : '未知错误'));
    }).then(function () {
      if (worker) { worker.terminate().catch(function () {}); worker = null; }
      busy = false;
      runBtn.removeAttribute('disabled');
      setTimeout(function () { showProgress(false); }, 600);
    });
  }

  runBtn.addEventListener('click', run);

  document.getElementById('reset').addEventListener('click', function () {
    if (busy) return;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    source = null;
    fileEl.value = '';
    shotWrap.style.display = 'none';
    shotEl.removeAttribute('src');
    Toy.setVal(outEl, '');
    Toy.hideMsg('msg');
    showProgress(false);
    setStatus('');
  });
})();
