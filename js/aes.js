/* ===========================================================
   纯 JS 实现的 AES-256-CBC（无外部依赖）
   仅供本地小工具使用，未做侧信道防护
   =========================================================== */
(function (global) {
  'use strict';

  /* ---------- GF(2^8) ---------- */
  function xtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
  function mul(a, b) {
    var r = 0, x = a & 0xff;
    b &= 0xff;
    for (var i = 0; i < 8; i++) {
      if (b & 1) r ^= x;
      x = xtime(x);
      b >>= 1;
    }
    return r & 0xff;
  }
  function rotl8(v, n) { return ((v << n) | (v >> (8 - n))) & 0xff; }

  /* ---------- S 盒 ---------- */
  var SBOX = new Uint8Array(256);
  var INV_SBOX = new Uint8Array(256);
  (function () {
    var p = 1, q = 1;
    do {
      p = (p ^ ((p << 1) & 0xff) ^ ((p & 0x80) ? 0x1b : 0)) & 0xff; // p *= 3
      q = (q ^ ((q << 1) & 0xff)) & 0xff;                            // q /= 3
      q = (q ^ ((q << 2) & 0xff)) & 0xff;
      q = (q ^ ((q << 4) & 0xff)) & 0xff;
      if (q & 0x80) q = (q ^ 0x09) & 0xff;
      var xf = q ^ rotl8(q, 1) ^ rotl8(q, 2) ^ rotl8(q, 3) ^ rotl8(q, 4);
      SBOX[p] = (xf ^ 0x63) & 0xff;
    } while (p !== 1);
    SBOX[0] = 0x63;
    for (var i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
  })();

  var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40];

  /* ---------- 密钥扩展：Nk = 8, Nr = 14 ---------- */
  var NK = 8, NR = 14;

  function expandKey(key) {
    var w = new Uint8Array(16 * (NR + 1));
    w.set(key);
    var temp = new Uint8Array(4);
    for (var i = NK; i < 4 * (NR + 1); i++) {
      temp[0] = w[(i - 1) * 4];
      temp[1] = w[(i - 1) * 4 + 1];
      temp[2] = w[(i - 1) * 4 + 2];
      temp[3] = w[(i - 1) * 4 + 3];
      if (i % NK === 0) {
        var t = temp[0];
        temp[0] = temp[1]; temp[1] = temp[2]; temp[2] = temp[3]; temp[3] = t;
        for (var j = 0; j < 4; j++) temp[j] = SBOX[temp[j]];
        temp[0] ^= RCON[(i / NK) | 0];
      } else if (i % NK === 4) {
        for (var k = 0; k < 4; k++) temp[k] = SBOX[temp[k]];
      }
      for (var m = 0; m < 4; m++) w[i * 4 + m] = w[(i - NK) * 4 + m] ^ temp[m];
    }
    return w;
  }

  function addRoundKey(s, w, round) {
    for (var i = 0; i < 16; i++) s[i] ^= w[round * 16 + i];
  }
  function subBytes(s) { for (var i = 0; i < 16; i++) s[i] = SBOX[s[i]]; }
  function invSubBytes(s) { for (var i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]]; }

  function shiftRows(s) {
    var t = new Uint8Array(16);
    for (var r = 0; r < 4; r++)
      for (var c = 0; c < 4; c++)
        t[r + 4 * c] = s[r + 4 * ((c + r) % 4)];
    s.set(t);
  }
  function invShiftRows(s) {
    var t = new Uint8Array(16);
    for (var r = 0; r < 4; r++)
      for (var c = 0; c < 4; c++)
        t[r + 4 * c] = s[r + 4 * ((c - r + 4) % 4)];
    s.set(t);
  }

  function mixColumns(s) {
    for (var c = 0; c < 4; c++) {
      var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
      s[4 * c]     = mul(a0, 2) ^ mul(a1, 3) ^ a2 ^ a3;
      s[4 * c + 1] = a0 ^ mul(a1, 2) ^ mul(a2, 3) ^ a3;
      s[4 * c + 2] = a0 ^ a1 ^ mul(a2, 2) ^ mul(a3, 3);
      s[4 * c + 3] = mul(a0, 3) ^ a1 ^ a2 ^ mul(a3, 2);
    }
  }
  function invMixColumns(s) {
    for (var c = 0; c < 4; c++) {
      var a0 = s[4 * c], a1 = s[4 * c + 1], a2 = s[4 * c + 2], a3 = s[4 * c + 3];
      s[4 * c]     = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      s[4 * c + 1] = mul(a0, 9)  ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      s[4 * c + 2] = mul(a0, 13) ^ mul(a1, 9)  ^ mul(a2, 14) ^ mul(a3, 11);
      s[4 * c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9)  ^ mul(a3, 14);
    }
  }

  function encryptBlock(input, w) {
    var s = new Uint8Array(input);
    addRoundKey(s, w, 0);
    for (var r = 1; r < NR; r++) {
      subBytes(s); shiftRows(s); mixColumns(s); addRoundKey(s, w, r);
    }
    subBytes(s); shiftRows(s); addRoundKey(s, w, NR);
    return s;
  }
  function decryptBlock(input, w) {
    var s = new Uint8Array(input);
    addRoundKey(s, w, NR);
    for (var r = NR - 1; r > 0; r--) {
      invShiftRows(s); invSubBytes(s); addRoundKey(s, w, r); invMixColumns(s);
    }
    invShiftRows(s); invSubBytes(s); addRoundKey(s, w, 0);
    return s;
  }

  /* ---------- CBC ---------- */
  function cbcEncrypt(data, key, iv) {
    var w = expandKey(key);
    var out = new Uint8Array(data.length);
    var prev = new Uint8Array(iv);
    var blk = new Uint8Array(16);
    for (var off = 0; off < data.length; off += 16) {
      for (var i = 0; i < 16; i++) blk[i] = data[off + i] ^ prev[i];
      var e = encryptBlock(blk, w);
      out.set(e, off);
      prev = e;
    }
    return out;
  }
  function cbcDecrypt(data, key, iv) {
    var w = expandKey(key);
    var out = new Uint8Array(data.length);
    var prev = new Uint8Array(iv);
    for (var off = 0; off < data.length; off += 16) {
      var blk = data.subarray(off, off + 16);
      var d = decryptBlock(blk, w);
      for (var i = 0; i < 16; i++) out[off + i] = d[i] ^ prev[i];
      prev = blk;
    }
    return out;
  }

  /* ---------- PKCS#7 ---------- */
  function pkcs7Pad(data, block) {
    var n = block - (data.length % block);
    var out = new Uint8Array(data.length + n);
    out.set(data);
    for (var i = data.length; i < out.length; i++) out[i] = n;
    return out;
  }
  function pkcs7Unpad(data) {
    if (data.length === 0) throw new Error('数据为空');
    var n = data[data.length - 1];
    if (n < 1 || n > 16 || n > data.length) throw new Error('填充不合法，密文可能已损坏');
    for (var i = data.length - n; i < data.length; i++) {
      if (data[i] !== n) throw new Error('填充校验失败，密文可能已损坏');
    }
    return data.subarray(0, data.length - n);
  }

  /* ---------- 编码辅助 ---------- */
  function utf8Bytes(str) { return new Uint8Array(new TextEncoder().encode(str)); }
  function utf8Str(bytes) { return new TextDecoder().decode(bytes); }

  function utf16leBytes(str) {
    var out = new Uint8Array(str.length * 2);
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      out[i * 2] = c & 0xff;
      out[i * 2 + 1] = (c >> 8) & 0xff;
    }
    return out;
  }
  function utf16leStr(bytes) {
    if (bytes.length % 2 !== 0) throw new Error('字节数为奇数，不是合法的 UTF-16LE');
    var s = '';
    var chunk = 8192;
    for (var i = 0; i < bytes.length; i += 2 * chunk) {
      var end = Math.min(i + 2 * chunk, bytes.length);
      var part = [];
      for (var j = i; j < end; j += 2) part.push(bytes[j] | (bytes[j + 1] << 8));
      s += String.fromCharCode.apply(null, part);
    }
    return s;
  }

  global.ToyAES = {
    cbcEncrypt: cbcEncrypt,
    cbcDecrypt: cbcDecrypt,
    pkcs7Pad: pkcs7Pad,
    pkcs7Unpad: pkcs7Unpad,
    utf8Bytes: utf8Bytes,
    utf8Str: utf8Str,
    utf16leBytes: utf16leBytes,
    utf16leStr: utf16leStr,
    SBOX: SBOX
  };
})(typeof window !== 'undefined' ? window : globalThis);
