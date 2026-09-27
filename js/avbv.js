/* ===========================================================
   B 站 av 号 <-> BV 号 互转
   常量由官方真值反推并经线上数据校验
   =========================================================== */
(function (global) {
  'use strict';

  var BASE = 58n;
  var XOR_CODE = 23442827791579n;
  var MASK_CODE = 2251799813685247n;
  var MAX_AID = 1n << 51n;
  var TABLE = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

  function av2bv(aid) {
    if (!Number.isFinite(aid) || aid <= 0 || !Number.isInteger(aid)) {
      throw new Error('av 号必须是正整数');
    }
    if (aid > Number(MASK_CODE)) throw new Error('av 号超出可转换范围');
    var b = ['B', 'V', '1', '0', '0', '0', '0', '0', '0', '0', '0', '0'];
    var i = 11;
    var tmp = (MAX_AID | BigInt(aid)) ^ XOR_CODE;
    while (tmp > 0n) {
      b[i] = TABLE[Number(tmp % BASE)];
      tmp = tmp / BASE;
      i--;
    }
    var t;
    t = b[3]; b[3] = b[9]; b[9] = t;
    t = b[4]; b[4] = b[7]; b[7] = t;
    return b.join('');
  }

  function bv2av(bv) {
    var s = String(bv).trim();
    if (!/^BV1[1-9A-HJ-NP-Za-km-z]{9}$/.test(s)) {
      // 放宽：只校验长度与前缀，便于处理个别大小写
      if (!/^BV1[0-9A-Za-z]{9}$/.test(s)) throw new Error('BV 号格式不正确（应为 BV1 + 9 位）');
    }
    var a = s.split('');
    var t;
    t = a[3]; a[3] = a[9]; a[9] = t;
    t = a[4]; a[4] = a[7]; a[7] = t;
    var tmp = 0n;
    for (var i = 3; i < 12; i++) {
      var idx = TABLE.indexOf(a[i]);
      if (idx < 0) throw new Error('BV 号含有非法字符：' + a[i]);
      tmp = tmp * BASE + BigInt(idx);
    }
    return Number((tmp & MASK_CODE) ^ XOR_CODE);
  }

  /** 自动识别输入类型并转换 */
  function convert(raw) {
    var s = String(raw).trim();
    if (!s) throw new Error('请输入内容');
    var m = s.match(/^(?:av)?(\d+)$/i);
    if (m) {
      var aid = parseInt(m[1], 10);
      return { type: 'av', input: 'av' + aid, output: av2bv(aid) };
    }
    var m2 = s.match(/^(BV1[0-9A-Za-z]{9})$/i);
    if (m2) {
      // 首位之外的字符区分大小写，统一按原样处理
      var bv = m2[1];
      return { type: 'bv', input: bv, output: 'av' + bv2av(bv) };
    }
    throw new Error('无法识别：请填 av 号（如 av170001 或 170001）或 BV 号（如 BV17x411w7KC）');
  }

  global.ToyAVBV = { av2bv: av2bv, bv2av: bv2av, convert: convert };
})(typeof window !== 'undefined' ? window : globalThis);
