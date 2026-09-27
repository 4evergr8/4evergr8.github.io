/* ===========================================================
   IP 信息：公网出口查询 + WebRTC 泄漏检测
   =========================================================== */
(function () {
  'use strict';

  var TIMEOUT = 8000;

  /* 按顺序尝试，谁先成功用谁 */
  var SOURCES = [
    {
      name: 'ipwho.is',
      url: 'https://ipwho.is/',
      parse: function (d) {
        if (!d || !d.success || !d.ip) throw new Error('bad payload');
        var c = d.connection || {};
        var t = d.timezone || {};
        return {
          ip: d.ip,
          type: d.type || '',
          loc: [d.country, d.region, d.city].filter(Boolean).join(' · '),
          isp: c.isp || c.org || '',
          asn: c.asn ? 'AS' + c.asn + (c.org ? ' · ' + c.org : '') : '',
          tz: t.id ? t.id + (t.utc ? ' (UTC' + t.utc + ')' : '') : '',
          geo: (d.latitude != null && d.longitude != null) ? d.latitude + ', ' + d.longitude : ''
        };
      }
    },
    {
      name: 'ip.sb',
      url: 'https://api.ip.sb/geoip',
      parse: function (d) {
        if (!d || !d.ip) throw new Error('bad payload');
        return {
          ip: d.ip,
          type: /:/.test(d.ip) ? 'IPv6' : 'IPv4',
          loc: [d.country, d.region, d.city].filter(Boolean).join(' · '),
          isp: d.isp || d.organization || '',
          asn: d.asn ? 'AS' + d.asn + (d.asn_organization ? ' · ' + d.asn_organization : '') : '',
          tz: d.timezone || '',
          geo: (d.latitude != null && d.longitude != null) ? d.latitude + ', ' + d.longitude : ''
        };
      }
    },
    {
      name: 'ipify',
      url: 'https://api64.ipify.org?format=json',
      parse: function (d) {
        if (!d || !d.ip) throw new Error('bad payload');
        return { ip: d.ip, type: /:/.test(d.ip) ? 'IPv6' : 'IPv4', loc: '', isp: '', asn: '', tz: '', geo: '' };
      }
    }
  ];

  var FIELDS = ['ip', 'type', 'loc', 'isp', 'asn', 'tz', 'geo'];

  function fetchJson(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error('timeout'));
      }, TIMEOUT);

      fetch(url, { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(data);
        })
        .catch(function (err) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function setRow(id, text) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '—';
    el.classList.toggle('na', !text);
  }

  function query() {
    Toy.hideMsg('msg');
    document.getElementById('src').textContent = '查询中…';
    setRow('ip', '正在获取…');
    FIELDS.forEach(function (k) { if (k !== 'ip') setRow(k, ''); });
    document.getElementById('copyIp').value = '';

    var i = 0;
    function next() {
      if (i >= SOURCES.length) {
        document.getElementById('src').textContent = '失败';
        setRow('ip', '');
        Toy.showMsg('msg', '三个接口都没能返回结果，检查网络后重试');
        return;
      }
      var src = SOURCES[i++];
      document.getElementById('src').textContent = src.name;
      fetchJson(src.url)
        .then(function (data) {
          var info;
          try { info = src.parse(data); } catch (e) { return next(); }
          FIELDS.forEach(function (k) { setRow(k, info[k]); });
          document.getElementById('copyIp').value = info.ip;
          document.getElementById('src').textContent = '来源 ' + src.name;
        })
        .catch(next);
    }
    next();
  }

  document.getElementById('refresh').addEventListener('click', query);

  /* ===========================================================
     WebRTC / STUN 泄漏检测
     =========================================================== */
  var RE_V4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  var RE_V6 = /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi;

  function isPrivateV4(ip) {
    var p = ip.split('.').map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    return false;
  }

  function probeStun() {
    return new Promise(function (resolve) {
      var found = [];
      var pc = null;
      var settled = false;

      function finish() {
        if (settled) return;
        settled = true;
        try { if (pc) pc.close(); } catch (e) {}
        resolve(found);
      }

      var timer = setTimeout(finish, 3000);

      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          iceCandidatePoolSize: 0
        });
      } catch (e) {
        clearTimeout(timer);
        finish();
        return;
      }

      pc.onicecandidate = function (e) {
        if (!e.candidate || !e.candidate.candidate) { clearTimeout(timer); finish(); return; }
        var line = e.candidate.candidate;
        if (/\.local\b/i.test(line)) return;               // mDNS 混淆地址，跳过

        var kind = /typ\s+srflx/.test(line) ? 'srflx'
          : /typ\s+relay/.test(line) ? 'relay'
            : /typ\s+host/.test(line) ? 'host' : 'other';

        var addrs = (line.match(RE_V4) || []).concat(line.match(RE_V6) || []);
        addrs.forEach(function (addr) {
          var ipv4 = addr.indexOf(':') < 0;
          if (ipv4 && isPrivateV4(addr) && kind === 'host') return;  // 内网地址没意义
          var dup = found.some(function (f) { return f.addr === addr && f.kind === kind; });
          if (!dup) found.push({ addr: addr, kind: kind });
        });
      };

      try {
        pc.createDataChannel('probe');
        pc.createOffer().then(function (offer) {
          return pc.setLocalDescription(offer);
        }).catch(function () {
          clearTimeout(timer);
          finish();
        });
      } catch (e) {
        clearTimeout(timer);
        finish();
      }
    });
  }

  var stunList = document.getElementById('stunList');
  var stunStatus = document.getElementById('stunStatus');
  var stunBtn = document.getElementById('stun');
  var stunSrc = document.getElementById('stunSrc');

  function setStunStatus(text, spinning) {
    stunStatus.innerHTML = '';
    if (!text) return;
    if (spinning) {
      var s = document.createElement('span');
      s.className = 'spin';
      stunStatus.appendChild(s);
    }
    var span = document.createElement('span');
    span.textContent = text;
    stunStatus.appendChild(span);
  }

  stunBtn.addEventListener('click', function () {
    if (typeof RTCPeerConnection === 'undefined') {
      setStunStatus('当前浏览器不支持 WebRTC');
      return;
    }
    stunBtn.setAttribute('disabled', '');
    stunList.innerHTML = '';
    stunSrc.textContent = '检测中';
    setStunStatus('正在收集候选地址…', true);

    probeStun().then(function (list) {
      stunBtn.removeAttribute('disabled');
      stunList.innerHTML = '';
      if (!list.length) {
        stunSrc.textContent = '无结果';
        var chip = document.createElement('span');
        chip.className = 'ip-chip';
        chip.textContent = '没有拿到候选地址';
        stunList.appendChild(chip);
        setStunStatus('浏览器可能禁用了 WebRTC，或网络不允许 STUN');
        return;
      }
      stunSrc.textContent = list.length + ' 个地址';
      list.forEach(function (item) {
        var chip = document.createElement('span');
        chip.className = 'ip-chip' + (item.kind === 'srflx' || item.kind === 'relay' ? ' is-public' : '');
        chip.textContent = item.addr + ' · ' + item.kind;
        stunList.appendChild(chip);
      });
      setStunStatus('完成。标粉的是对端可见的公网候选地址');
    });
  });

  query();
})();
