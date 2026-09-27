/* ===========================================================
   佛曰 / 与佛论禅 V1（"佛曰：……"）
   明文 -> UTF-16LE -> PKCS#7 -> AES-256-CBC(固定密钥) -> 咒字映射
   V2「如是我闻」在加密后还套了一层 7z/LZMA，浏览器端不实现
   =========================================================== */
(function (global) {
  'use strict';

  var FO_YUE = '滅苦婆娑耶陀跋多漫都殿悉夜爍帝吉利阿無南那怛喝羯勝摩伽謹波者穆僧' +
    '室藝尼瑟地彌菩提蘇醯盧呼舍佛參沙伊隸麼遮闍度蒙孕薩夷迦他姪豆特逝' +
    '朋輸楞栗寫數曳諦羅曰咒即密若般故不實真訶切一除能等是上明大神知三' +
    '藐耨得依諸世槃涅竟究想夢倒顛離遠怖恐有礙心所以亦智道。集盡死老至';

  var BYTE_MARK = '冥奢梵呐俱哆怯諳罰侄缽皤';

  // keyfc 与佛论禅 V1 的固定密钥与 IV
  var KEY = new Uint8Array(Array.from('XDXDtudou@KeyFansClub^_^Encode!!').map(function (c) { return c.charCodeAt(0); }));
  var IV = new Uint8Array(Array.from('Potato@Key@_@=_=').map(function (c) { return c.charCodeAt(0); }));

  var FO = Array.from(FO_YUE);
  var BM = Array.from(BYTE_MARK);

  function bytesToFoYue(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (b < 128) {
        out += FO[b];
      } else {
        out += BM[(Math.random() * BM.length) | 0] + FO[b - 128];
      }
    }
    return out;
  }

  function foYueToBytes(text) {
    var chars = Array.from(text);
    var out = new Uint8Array(chars.length);
    var p = 0;
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (BM.indexOf(c) >= 0) {
        i++;
        if (i >= chars.length) throw new Error('密文结尾出现孤立的转义字');
        var hi = FO.indexOf(chars[i]);
        if (hi < 0) throw new Error('转义字后不是合法咒字：' + chars[i]);
        out[p++] = hi + 128;
      } else {
        var lo = FO.indexOf(c);
        if (lo < 0) throw new Error('含有非佛曰字符：' + c);
        out[p++] = lo;
      }
    }
    return out.subarray(0, p);
  }

  /** 去掉前缀与所有空白 */
  function clean(text) {
    var s = String(text).replace(/[\s\u3000\r\n]+/g, '');
    s = s.replace(/^(佛曰|佛曰)[:：]?/, '');
    s = s.replace(/^(如是我闻|如是我聞)[:：]?/, '');
    return s;
  }

  function isRuShiWoWen(text) {
    return /^(如是我闻|如是我聞)[:：]/.test(String(text).replace(/[\s\u3000\r\n]+/g, ''));
  }

  function encode(text) {
    if (!text) throw new Error('请输入要加密的文字');
    var A = global.ToyAES;
    var bytes = A.utf16leBytes(text);
    var padded = A.pkcs7Pad(bytes, 16);
    var ct = A.cbcEncrypt(padded, KEY, IV);
    return '佛曰：' + bytesToFoYue(ct);
  }

  function decode(text) {
    if (isRuShiWoWen(text)) {
      throw new Error('这是「如是我闻」(V2) 密文，它在 AES 之外还套了一层 7z 压缩，本工具未实现该版本');
    }
    var s = clean(text);
    if (!s) throw new Error('请输入要解密的佛语');
    var A = global.ToyAES;
    var data = foYueToBytes(s);
    if (data.length === 0 || data.length % 16 !== 0) {
      throw new Error('密文长度不是 16 的整数倍，可能复制不完整或被简繁转换破坏');
    }
    var plain = A.cbcDecrypt(data, KEY, IV);
    return A.utf16leStr(A.pkcs7Unpad(plain));
  }

  global.ToyFoYue = {
    encode: encode,
    decode: decode,
    isRuShiWoWen: isRuShiWoWen,
    FO_YUE: FO_YUE,
    BYTE_MARK: BYTE_MARK
  };
})(typeof window !== 'undefined' ? window : globalThis);
