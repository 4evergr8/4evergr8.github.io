/* ===========================================================
   Base64 编解码（UTF-8 安全，支持标准 / URL 安全两种字母表）
   =========================================================== */
(function (global) {
  'use strict';

  var STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function encodeBytes(bytes, urlsafe) {
    var table = urlsafe ? URL : STD;
    var out = '';
    var i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += table[(n >> 18) & 63] + table[(n >> 12) & 63] + table[(n >> 6) & 63] + table[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var n1 = bytes[i] << 16;
      out += table[(n1 >> 18) & 63] + table[(n1 >> 12) & 63] + '==';
    } else if (rest === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += table[(n2 >> 18) & 63] + table[(n2 >> 12) & 63] + table[(n2 >> 6) & 63] + '=';
    }
    return out;
  }

  function decodeBytes(str) {
    var s = String(str).replace(/[\s\r\n]+/g, '');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    if (!s) throw new Error('请输入内容');
    if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error('含有非 Base64 字符');
    var clean = s.replace(/=+$/, '');
    if (clean.length % 4 === 1) throw new Error('长度不合法');
    var out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    var p = 0, buf = 0, bits = 0;
    for (var i = 0; i < clean.length; i++) {
      var v = STD.indexOf(clean[i]);
      if (v < 0) throw new Error('含有非 Base64 字符：' + clean[i]);
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[p++] = (buf >> bits) & 0xff;
      }
    }
    return out.subarray(0, p);
  }

  function encodeText(text, urlsafe, wrap) {
    var bytes = new TextEncoder().encode(text);
    var s = encodeBytes(bytes, urlsafe);
    if (wrap && !urlsafe && s.length > 76) {
      return s.replace(/(.{76})/g, '$1\n').trim();
    }
    return s;
  }

  function decodeText(text) {
    if (!String(text).replace(/\s+/g, '')) return '';
    var bytes = decodeBytes(text);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  global.ToyBase64 = {
    encodeText: encodeText,
    decodeText: decodeText,
    encodeBytes: encodeBytes,
    decodeBytes: decodeBytes
  };
})(typeof window !== 'undefined' ? window : globalThis);
