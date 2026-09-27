/* ===========================================================
   反向图片搜索：上传图床拿外链 -> 跳转各搜索引擎
   =========================================================== */
(function () {
  'use strict';

  /* 图床地址写死，页面上不可修改。要换图床就改这一行。
     需要支持 POST /upload/{key} 与 GET /download/{key} 两个接口。 */
  var IMAGE_HOST = 'https://image-6eu.pages.dev';

  var ENGINES = [
    ['Google Lens', 'https://lens.google.com/uploadbyurl?url='],
    ['Google 图片', 'https://www.google.com/searchbyimage?client=app&image_url='],
    ['百度识图', 'https://graph.baidu.com/details?isfromtusoupc=1&tn=pc&carousel=0&image='],
    ['Yandex', 'https://yandex.com/images/search?rpt=imageview&url='],
    ['SauceNAO', 'https://saucenao.com/search.php?url='],
    ['ascii2d', 'https://ascii2d.net/search/url/'],
    ['TinEye', 'https://tineye.com/search/?url='],
    ['IQDB', 'https://iqdb.org/?url='],
    ['3D IQDB', 'https://3d.iqdb.org/?url='],
    ['Lenso.ai', 'https://lenso.ai/en/search-by-url?url='],
    ['trace.moe', 'https://trace.moe/?url='],
    ['Bing 视觉搜索', 'https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:']
  ];

  var urlEl = document.getElementById('url');
  var fileEl = document.getElementById('file');
  var dropEl = document.getElementById('drop');
  var shotWrap = document.getElementById('shotWrap');
  var shotEl = document.getElementById('shot');
  var statusEl = document.getElementById('status');
  var enginesEl = document.getElementById('engines');
  var engCount = document.getElementById('engCount');

  var picked = null;      // 选中的 File
  var objectUrl = null;

  /* ---------- 状态 ---------- */
  function setStatus(text, spinning) {
    statusEl.innerHTML = '';
    if (!text) return;
    if (spinning) {
      var s = document.createElement('span');
      s.className = 'spin';
      statusEl.appendChild(s);
    }
    var span = document.createElement('span');
    span.textContent = text;
    statusEl.appendChild(span);
  }

  /* ---------- 引擎按钮 ---------- */
  function renderEngines() {
    var url = urlEl.value.trim();
    enginesEl.innerHTML = '';
    if (!url) {
      engCount.textContent = '等待图片链接';
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '先上传图片，或者直接在上面填一个图片地址';
      enginesEl.appendChild(empty);
      return;
    }
    engCount.textContent = ENGINES.length + ' 个可用';
    var enc = encodeURIComponent(url);
    ENGINES.forEach(function (item) {
      var a = document.createElement('a');
      a.className = 'engine';
      a.href = item[1] + enc;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      var name = document.createElement('span');
      name.textContent = item[0];
      var go = document.createElement('span');
      go.className = 'go';
      go.textContent = '↗';
      a.appendChild(name);
      a.appendChild(go);
      enginesEl.appendChild(a);
    });
  }

  function setUrl(url) {
    urlEl.value = url;
    renderEngines();
  }

  /* ---------- 选图 ---------- */
  function useFile(file, name) {
    if (!file) return;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    picked = file;
    objectUrl = URL.createObjectURL(file);
    shotEl.src = objectUrl;
    shotWrap.style.display = 'flex';
    Toy.hideMsg('msg');
    setStatus('已选择 ' + (name || file.name || '图片') + '，点「上传到图床」继续');
  }

  fileEl.addEventListener('change', function () {
    var f = fileEl.files && fileEl.files[0];
    if (f) useFile(f, f.name);
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
    dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('over'); });
  });
  dropEl.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) useFile(f, f.name);
    else Toy.showMsg('msg', '请拖入图片文件');
  });

  document.addEventListener('paste', function (e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { useFile(f, '粘贴的图片'); e.preventDefault(); }
        return;
      }
    }
  });

  /* 手动改链接也要刷新按钮 */
  urlEl.addEventListener('input', renderEngines);
  urlEl.addEventListener('change', renderEngines);

  /* ---------- 剪贴板 ---------- */
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
              useFile(new File([blob], 'clipboard.png', { type: blob.type }), '剪贴板图片');
            });
          }
        }
      }
      return navigator.clipboard.readText().then(function (text) {
        if (text && /^https?:\/\//i.test(text.trim())) { setUrl(text.trim()); Toy.toast('已填入图片链接'); }
        else Toy.showMsg('msg', '剪贴板里没有图片，也没有链接');
      });
    }).catch(function () {
      Toy.showMsg('msg', '读取剪贴板失败，请用 Ctrl / Cmd + V 粘贴');
    });
  });

  /* ---------- 上传 ---------- */
  function randomKey() {
    var chars = 'abcdefghijklmnopqrstuvwxyz';
    var s = '';
    for (var i = 0; i < 5; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }

  function upload() {
    if (!picked) { Toy.showMsg('msg', '先选一张图片'); return; }
    var host = IMAGE_HOST.replace(/\/+$/, '');

    var stamp = String(9999999999999 - Date.now()).replace(/^-/, '0');
    var key = stamp.padStart(13, '0') + randomKey() + '-WEB';

    var form = new FormData();
    form.append('file', picked, picked.name || 'image.png');

    Toy.hideMsg('msg');
    setStatus('上传中…', true);

    fetch(host + '/upload/' + key, { method: 'POST', body: form })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            throw new Error('HTTP ' + res.status + (t ? ' · ' + t.slice(0, 120) : ''));
          });
        }
        var url = host + '/download/' + key;
        setUrl(url);
        setStatus('上传完成');
        Toy.toast('链接已生成');
        Toy.reveal(enginesEl);
      })
      .catch(function (err) {
        setStatus('上传失败');
        Toy.showMsg('msg', '上传失败：' + (err && err.message ? err.message : '未知错误') +
          '。多半是图床地址不可用，换一个试试。');
      });
  }

  document.getElementById('upload').addEventListener('click', upload);

  document.getElementById('reset').addEventListener('click', function () {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    picked = null;
    fileEl.value = '';
    urlEl.value = '';
    shotWrap.style.display = 'none';
    shotEl.removeAttribute('src');
    Toy.hideMsg('msg');
    setStatus('');
    renderEngines();
  });

  renderEngines();
})();
