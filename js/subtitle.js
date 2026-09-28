/* ===========================================================
   字幕转换
   思路：任何格式先解析成统一的中间结构，再由中间结构生成目标格式。

     中间结构 = [ { start: 秒, end: 秒, text: 文本 } , ... ]

   LRC 只有起始时间，没有结束时间，所以：
     - 若原文带空行条目（[mm:ss.xx] 后面没文字），用它作为上一行的结束时间；
     - 若不带空行，则用下一行的起始时间推断；最后一行按 DEFAULT_GAP 计。
   =========================================================== */
(function () {
  'use strict';

  var DEFAULT_GAP = 3;   // 推断不出结束时间时的默认时长（秒）

  /* ---------------- 时间工具 ---------------- */
  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  function frac(str) {
    if (!str) return 0;
    if (str.length === 3) return +str / 1000;
    if (str.length === 2) return +str / 100;
    return +str / 10;
  }

  function toMs(t) { return Math.max(0, Math.round(t * 1000)); }

  function fmtSrt(t) {
    var ms = toMs(t);
    return pad(Math.floor(ms / 3600000), 2) + ':' +
           pad(Math.floor(ms % 3600000 / 60000), 2) + ':' +
           pad(Math.floor(ms % 60000 / 1000), 2) + ',' +
           pad(ms % 1000, 3);
  }

  function fmtVtt(t) {
    var ms = toMs(t);
    return pad(Math.floor(ms / 3600000), 2) + ':' +
           pad(Math.floor(ms % 3600000 / 60000), 2) + ':' +
           pad(Math.floor(ms % 60000 / 1000), 2) + '.' +
           pad(ms % 1000, 3);
  }

  function fmtLrc(t) {
    var ms = toMs(t);
    return '[' + pad(Math.floor(ms / 60000), 2) + ':' +
           pad(Math.floor(ms % 60000 / 1000), 2) + '.' +
           pad(Math.floor(ms % 1000 / 10), 2) + ']';
  }

  /* 00:00:01,000 / 00:00:01.000 / 01:00.000 / 1:02 */
  function parseClock(str) {
    var m = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?/.exec(str || '');
    if (!m) return null;
    var h = m[1] ? +m[1] : 0;
    return h * 3600 + (+m[2]) * 60 + (+m[3]) + frac(m[4]);
  }

  /* mm:ss.xx / mm:ss:xx / mm:ss */
  function parseLrcTime(str) {
    var m = /^(\d{1,4}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec((str || '').trim());
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]) + frac(m[3]);
  }

  /* 多行文本压成一行，LRC 一行一个时间戳放不下换行 */
  function oneLine(t) {
    return String(t == null ? '' : t).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  }

  /* ---------------- 解析：LRC ---------------- */
  function parseLrc(text) {
    var lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    var entries = [];
    var offset = 0;   // [offset:+500] 单位毫秒，正值表示提前显示

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;

      var tags = [];
      var re = /\[([^\]]*)\]/g;
      var m;
      while ((m = re.exec(line))) tags.push(m[1]);
      if (!tags.length) return;

      var rest = line.replace(/\[[^\]]*\]/g, '').trim();
      var times = [];

      tags.forEach(function (tag) {
        if (/^offset:/i.test(tag)) {
          var v = parseInt(tag.slice(7).trim(), 10);
          if (!isNaN(v)) offset = v / 1000;
          return;
        }
        var t = parseLrcTime(tag);
        if (t != null) times.push(t);
      });

      if (!times.length) return;   // 纯元数据行 [ti:] [ar:] 之类
      times.forEach(function (t) {
        entries.push({ time: Math.max(0, t - offset), text: rest });
      });
    });

    entries.sort(function (a, b) { return a.time - b.time; });

    var cues = [];
    var pending = null;
    var blankEnds = false;

    entries.forEach(function (e) {
      if (!e.text) {                       // 空行条目 = 上一行的结束时间戳
        if (pending) {
          pending.end = e.time;
          cues.push(pending);
          pending = null;
          blankEnds = true;
        }
        return;
      }
      if (pending) { pending.end = e.time; cues.push(pending); }
      pending = { start: e.time, end: null, text: e.text };
    });
    if (pending) cues.push(pending);

    return { cues: normalize(cues), blankEnds: blankEnds };
  }

  /* ---------------- 解析：SRT / VTT ---------------- */
  function parseCueText(text) {
    var blocks = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
    var cues = [];
    var isVtt = /^\s*WEBVTT/.test(String(text));

    blocks.forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      if (!lines.length) return;

      if (isVtt && /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0].trim())) return;

      var idx = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('-->') >= 0) { idx = i; break; }
      }
      if (idx < 0) return;

      var parts = lines[idx].split('-->');
      var start = parseClock(parts[0]);
      var end = parseClock(parts[1]);
      if (start == null) return;
      if (end == null) end = start + DEFAULT_GAP;

      var body = lines.slice(idx + 1).join('\n').trim();
      if (isVtt) {
        body = body.replace(/<\/?v[^>]*>/gi, '')                        // 说话人标记
                   .replace(/<\d{1,3}:\d{1,2}(?::\d{1,2})?\.\d{1,3}>/g, ''); // 行内时间戳
      }

      cues.push({ start: start, end: end, text: body });
    });

    return { cues: normalize(cues), blankEnds: false };
  }

  /* ---------------- 归一化 ---------------- */
  function normalize(cues) {
    return cues.map(function (c, i) {
      var start = Math.max(0, c.start);
      var end = c.end == null ? null : c.end;
      if (end == null || end <= start) {
        var next = cues[i + 1];
        end = next ? Math.max(next.start, start + 0.001) : start + DEFAULT_GAP;
      }
      return { start: start, end: end, text: c.text || '' };
    });
  }

  /* ---------------- 生成 ---------------- */
  function toSrt(cues) {
    var out = [];
    cues.forEach(function (c, i) {
      out.push(String(i + 1));
      out.push(fmtSrt(c.start) + ' --> ' + fmtSrt(c.end));
      out.push(c.text);
      out.push('');
    });
    return out.join('\n');
  }

  function toVtt(cues) {
    var out = ['WEBVTT', ''];
    cues.forEach(function (c) {
      out.push(fmtVtt(c.start) + ' --> ' + fmtVtt(c.end));
      out.push(c.text);
      out.push('');
    });
    return out.join('\n');
  }

  function toLrc(cues, endBlank) {
    var out = [];
    cues.forEach(function (c) {
      out.push(fmtLrc(c.start) + oneLine(c.text));
      if (endBlank) out.push(fmtLrc(c.end));   // 结束时间戳写成空行
    });
    return out.join('\n');
  }

  /* ---------------- 格式识别 ---------------- */
  function detect(text) {
    var s = String(text).replace(/^\uFEFF/, '');
    if (/^\s*WEBVTT/m.test(s)) return 'vtt';
    // LRC 必须先判：时间码形如 [00:01.00]，否则会被下面 VTT 的点号规则抢走
    if (/\[\d{1,4}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(s)) return 'lrc';
    if (/\d{1,3}:\d{1,2}:\d{1,2},\d{1,3}/.test(s) || /\d{1,3}:\d{1,2},\d{1,3}/.test(s)) return 'srt';
    if (/\d{1,3}:\d{1,2}:\d{1,2}\.\d{1,3}/.test(s) || /\d{1,3}:\d{1,2}\.\d{1,3}/.test(s)) return 'vtt';
    return '';
  }

  function detectByExt(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || '');
    var ext = m ? m[1].toLowerCase() : '';
    if (ext === 'lrc') return 'lrc';
    if (ext === 'srt') return 'srt';
    if (ext === 'vtt') return 'vtt';
    return '';
  }

  /* ---------------- 对外：解析 + 转换 ---------------- */
  function parse(text, format) {
    var f = format;
    if (!f) f = detect(text);
    if (f === 'lrc') return parseLrc(text);
    if (f === 'srt' || f === 'vtt') return parseCueText(text);
    throw new Error('认不出这是什么字幕格式');
  }

  function stringify(cues, format, endBlank) {
    if (format === 'srt') return toSrt(cues);
    if (format === 'vtt') return toVtt(cues);
    return toLrc(cues, endBlank);
  }

  /* ===========================================================
     页面
     =========================================================== */
  var fileEl = document.getElementById('file');
  var dropEl = document.getElementById('drop');
  var fileListEl = document.getElementById('fileList');
  var fileCountEl = document.getElementById('fileCount');
  var inEl = document.getElementById('in');
  var resultsEl = document.getElementById('results');

  var target = 'lrc';
  var source = 'auto';
  var endBlank = true;
  var files = [];

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
  bindSeg('target', function (v) { target = v; });
  bindSeg('source', function (v) { source = v; });
  bindSeg('endblank', function (v) { endBlank = v === '1'; });

  /* ---------- 文件选择 ---------- */
  function addFiles(list) {
    var added = 0;
    Array.prototype.forEach.call(list, function (f) {
      var dup = files.some(function (x) { return x.name === f.name && x.size === f.size; });
      if (!dup) { files.push(f); added++; }
    });
    if (added) renderFiles();
  }

  function renderFiles() {
    fileListEl.innerHTML = '';
    fileCountEl.textContent = files.length ? files.length + ' 个文件' : '未选择';
    files.forEach(function (f, i) {
      var chip = document.createElement('span');
      chip.className = 'file-chip';
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = f.name;
      var x = document.createElement('button');
      x.className = 'x';
      x.type = 'button';
      x.textContent = '×';
      x.setAttribute('aria-label', '移除 ' + f.name);
      x.addEventListener('click', function () {
        files.splice(i, 1);
        renderFiles();
      });
      chip.appendChild(n);
      chip.appendChild(x);
      fileListEl.appendChild(chip);
    });
  }

  fileEl.addEventListener('change', function () {
    addFiles(fileEl.files);
    fileEl.value = '';
  });

  dropEl.addEventListener('click', function (e) {
    if (e.target === fileEl) return;
    fileEl.click();
  });
  dropEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); }
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('over'); });
  });
  dropEl.addEventListener('drop', function (e) {
    var list = e.dataTransfer && e.dataTransfer.files;
    if (list && list.length) addFiles(list);
  });

  /* ---------- 读取文件（UTF-8 优先，失败退回 GBK） ---------- */
  function readText(file) {
    return file.arrayBuffer().then(function (buf) {
      try {
        return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), enc: 'UTF-8' };
      } catch (e) {
        try {
          return { text: new TextDecoder('gbk').decode(buf), enc: 'GBK' };
        } catch (e2) {
          return { text: new TextDecoder('utf-8').decode(buf), enc: 'UTF-8' };
        }
      }
    });
  }

  /* ---------- 结果渲染 ---------- */
  function addResult(name, out, notes, srcFormat) {
    var item = document.createElement('div');
    item.className = 'res-item';

    var head = document.createElement('div');
    head.className = 'res-head';

    var nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = name;
    head.appendChild(nm);

    var tag = document.createElement('span');
    tag.className = notes.warn ? 'tag-warn' : 'tag-ok';
    tag.textContent = srcFormat.toUpperCase() + ' → ' + target.toUpperCase();
    head.appendChild(tag);

    var acts = document.createElement('div');
    acts.className = 'acts';

    var copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.type = 'button';
    copyBtn.textContent = '复制';
    copyBtn.addEventListener('click', function () { Toy.copy(out); });

    var dlBtn = document.createElement('button');
    dlBtn.className = 'btn';
    dlBtn.type = 'button';
    dlBtn.textContent = '下载';
    dlBtn.addEventListener('click', function () {
      var url = URL.createObjectURL(new Blob([out], { type: 'text/plain;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    acts.appendChild(copyBtn);
    acts.appendChild(dlBtn);
    head.appendChild(acts);

    if (notes.text) {
      var note = document.createElement('div');
      note.className = 'note';
      note.innerHTML = notes.text;
      head.appendChild(note);
    }

    var body = document.createElement('div');
    body.className = 'res-body';
    var ta = document.createElement('textarea');
    ta.className = 'editor';
    ta.readOnly = true;
    ta.spellcheck = false;
    ta.value = out;
    body.appendChild(ta);

    item.appendChild(head);
    item.appendChild(body);
    resultsEl.appendChild(item);
    Toy.autoGrow(ta);
  }

  function outName(srcName, fmt) {
    var base = String(srcName).replace(/\.[a-z0-9]+$/i, '') || 'subtitle';
    return base + '.' + fmt;
  }

  /* ---------- 转换 ---------- */
  function convert(text, srcFormat, name, enc) {
    var parsed = parse(text, srcFormat === 'auto' ? '' : srcFormat);
    var used = srcFormat === 'auto' ? (detect(text) || '') : srcFormat;
    var out = stringify(parsed.cues, target, endBlank);

    var notes = { text: '', warn: false };
    var bits = [];
    if (enc && enc !== 'UTF-8') bits.push('按 ' + enc + ' 解码');
    if (parsed.cues.length === 0) {
      notes.warn = true;
      bits.push('没有解析出任何字幕行，检查一下源格式是否选对');
    } else {
      bits.push('共 ' + parsed.cues.length + ' 行');
    }
    if (used === 'lrc') {
      if (parsed.blankEnds) {
        bits.push('原文件<b>带空行结尾</b>，已用空行时间戳作为结束时间');
      } else {
        bits.push('原文件<b>不带空行结尾</b>，结束时间按下一行起点推断，最后一行按 ' + DEFAULT_GAP + ' 秒计');
        notes.warn = true;
      }
    }
    if (target === 'lrc' && endBlank) {
      bits.push('已在每个结束时间点写入空行');
    }
    notes.text = bits.join('；');

    addResult(outName(name, target), out, notes, used || '?');
  }

  function run() {
    Toy.hideMsg('msg');
    resultsEl.innerHTML = '';

    if (files.length) {
      var jobs = files.map(function (f) {
        return readText(f).then(function (r) {
          var fmt = source === 'auto' ? (detect(r.text) || detectByExt(f.name)) : source;
          convert(r.text, source === 'auto' ? (fmt || 'auto') : source, f.name, r.enc);
        }).catch(function (err) {
          addResult(f.name, '', { text: '读取失败：' + (err && err.message ? err.message : '未知错误'), warn: true }, '?');
        });
      });
      Promise.all(jobs).then(function () {
        Toy.toast('转换完成');
        Toy.reveal(resultsEl);
      });
      return;
    }

    var text = inEl.value;
    if (!text.trim()) { Toy.showMsg('msg', '先上传文件或粘贴字幕文本'); return; }
    try {
      convert(text, source, 'subtitle');
      Toy.reveal(resultsEl);
    } catch (e) {
      Toy.showMsg('msg', e.message || '转换失败');
    }
  }

  document.getElementById('run').addEventListener('click', run);

  document.getElementById('clear').addEventListener('click', function () {
    files = [];
    renderFiles();
    Toy.setVal(inEl, '');
    resultsEl.innerHTML = '';
    Toy.hideMsg('msg');
  });

  renderFiles();
})();
