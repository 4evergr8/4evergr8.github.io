/* ===========================================================
   兽音译者（Beast Voice）
   文本 -> UTF-16 码元 4 位十六进制 -> 滚动偏移 -> 4 字符密钥映射

   密钥（字符集）为 4 个互不相同的字符：
     密文 = key[3] + key[1] + key[0] + 正文 + key[2]
   因此只要密文里恰好出现 4 种字符，就能自动推断出密钥顺序。
   =========================================================== */
(function (global) {
  'use strict';

  var DEFAULT_BEAST = ['嗷', '呜', '啊', '~'];

  function normalizeSet(list) {
    var arr = Array.from(String(list || ''));
    if (arr.length !== 4) throw new Error('密钥必须是 4 个字符');
    if (new Set(arr).size !== 4) throw new Error('密钥的 4 个字符不能重复');
    return arr;
  }

  function distinct(s) {
    return Array.from(new Set(Array.from(String(s))));
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    var out = [];
    arr.forEach(function (x, i) {
      permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(function (p) {
        out.push([x].concat(p));
      });
    });
    return out;
  }

  /** 给解密结果打分，用于从多个候选密钥里挑最像人话的那个 */
  function scoreText(s) {
    var sc = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 10 || c === 9 || c === 13) { sc += 1; continue; }  // 换行/制表
      if (c < 0x20) return -1e9;                                   // 控制字符，几乎不可能是明文
      if (c < 0x7f) { sc += 2; continue; }                         // ASCII 可打印
      if (c >= 0x4e00 && c <= 0x9fff) { sc += 3; continue; }       // 常用汉字
      if (c >= 0x3000 && c <= 0x303f) { sc += 2; continue; }       // 中文标点
      if (c >= 0xff00 && c <= 0xffef) { sc += 1; continue; }       // 全角
      sc -= 1;                                                     // 生僻区、代理对等
    }
    return sc;
  }

  /** 已确定密钥时的解码核心 */
  function decodeWith(s, beast) {
    var body = s;
    var prefix = beast[3] + beast[1] + beast[0];
    if (s.indexOf(prefix) === 0 && s.lastIndexOf(beast[2]) === s.length - 1) {
      body = s.slice(3, -1);
    } else {
      for (var q = 0; q < s.length; q++) {
        if (beast.indexOf(s[q]) < 0) {
          throw new Error('含有非兽音字符：' + s[q] + '（当前密钥 ' + beast.join('') + '）');
        }
      }
    }

    var code = '', n = 0;
    for (var i = 0; i < body.length; i += 2) {
      var p1 = beast.indexOf(body[i]);
      var p2 = beast.indexOf(body[i + 1]);
      if (p1 < 0 || p2 < 0) throw new Error('密文含非法字符或长度不为偶数');
      // 注意：JS 的 % 会保留负号，必须归一化到 0..15
      var k = ((p1 * 4 + p2 - n) % 16 + 16) % 16;
      code += k.toString(16);
      n++;
    }
    if (code.length % 4 !== 0) throw new Error('密文长度不合法');

    var out = '';
    for (var m = 0; m < code.length; m += 4) {
      out += String.fromCharCode(parseInt(code.substr(m, 4), 16));
    }
    return out;
  }

  /**
   * 从密文反推密钥。
   * 返回 { set: [4字符], method: 'mark' | 'guess' }，无法确定时返回 null。
   */
  function detectSet(cipher) {
    var t = String(cipher).replace(/\s+/g, '');
    var chars = distinct(t);
    if (chars.length !== 4) return null;   // 字符种类不是 4，无法唯一确定顺序

    // 优先：按头尾标记推断。密文 = key[3] key[1] key[0] … key[2]
    if (t.length >= 5) {
      var cand = [t[2], t[1], t[t.length - 1], t[0]];
      if (new Set(cand).size === 4) {
        var plain;
        try { plain = decodeWith(t, cand); } catch (e) { plain = null; }
        if (plain !== null && scoreText(plain) > 0) {
          return { set: cand, method: 'mark' };
        }
      }
    }

    // 兜底：4! = 24 种排列全试一遍，取明文最像人话的
    var best = null, bestScore = -Infinity;
    permutations(chars).forEach(function (p) {
      var plain;
      try { plain = decodeWith(t, p); } catch (e) { return; }
      var sc = scoreText(plain);
      if (sc > bestScore) { bestScore = sc; best = { set: p, method: 'guess' }; }
    });
    return best;
  }

  function encode(text, set) {
    var beast = (set && String(set).trim()) ? normalizeSet(set) : DEFAULT_BEAST.slice();
    var hex = '';
    for (var i = 0; i < text.length; i++) {
      hex += text.charCodeAt(i).toString(16).padStart(4, '0');
    }
    var code = '', n = 0;
    for (var j = 0; j < hex.length; j++) {
      var k = (parseInt(hex[j], 16) + n) % 16;
      code += beast[Math.floor(k / 4)] + beast[k % 4];
      n++;
    }
    return beast[3] + beast[1] + beast[0] + code + beast[2];
  }

  /** set 留空时自动识别密钥 */
  function decode(text, set) {
    var s = String(text).replace(/\s+/g, '');
    if (!s) throw new Error('请输入密文');
    var beast;
    if (set && String(set).trim()) {
      beast = normalizeSet(set);
    } else {
      var det = detectSet(s);
      if (!det) throw new Error('无法自动识别密钥：密文中应恰好出现 4 种字符，请手动填写密钥');
      beast = det.set;
    }
    return decodeWith(s, beast);
  }

  global.ToyBeast = {
    encode: encode,
    decode: decode,
    detectSet: detectSet,
    scoreText: scoreText,
    DEFAULT_BEAST: DEFAULT_BEAST
  };
})(typeof window !== 'undefined' ? window : globalThis);
