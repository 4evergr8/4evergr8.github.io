# 工具箱

几个纯前端的小工具集合，一个静态站点，没有构建步骤、没有后端、没有第三方账号。**文字类工具的运算全部发生在浏览器里，不上传任何数据，页面加载完就能断网使用。**

在线地址：<https://4evergr8.github.io>

---

## 工具一览

| 工具 | 页面 | 说明 | 联网 |
| --- | --- | --- | --- |
| AV / BV 互转 | `avbv.html` | B 站稿件 `av` 号与 `BV` 号互相转换，支持批量 | 否 |
| 兽音译者 | `beast.html` | 把文字变成「嗷呜啊~」，也能还原回来 | 否 |
| Base64 | `base64.html` | UTF-8 安全的编解码，标准 / URL 安全两种字母表 | 否 |
| 佛曰 | `foyue.html` | 与佛论禅 V1「佛曰：……」的加密与解密 | 否 |
| 浏览器 OCR | `ocr.html` | tesseract.js 本地识别中英日文字 | 首次需下载模型 |
| 反向图片搜索 | `image.html` | 传图床拿外链，一键跳到 12 个搜图站 | 是 |
| IP 信息查询 | `ip.html` | 公网出口、归属地、运营商 + WebRTC 泄漏检测 | 是 |

## 目录结构

```
├── index.html          首页
├── avbv.html           各工具页面（每个页面自带完整导航）
├── beast.html
├── base64.html
├── foyue.html
├── ocr.html
├── image.html
├── ip.html
├── css/
│   └── style.css       全部样式，明暗主题用 CSS 变量切换
└── js/
    ├── common.js       公共层：主题、输入框自动增高、复制、Toast、移动端适配
    ├── avbv.js         各工具的算法实现
    ├── beast.js
    ├── base64.js
    ├── foyue.js
    ├── aes.js          纯 JS 的 AES-256-CBC，仅供佛曰使用
    ├── ocr.js
    ├── image.js
    └── ip.js
```

## 本地跑起来

```bash
python -m http.server 8000
# 或者 npx serve
```

然后打开 <http://localhost:8000>。

直接双击用 `file://` 打开也能看，但浏览器只在 **HTTPS 或 localhost** 下才允许读取剪贴板，所以 OCR 和图搜的「读剪贴板」按钮会失效；`Ctrl / Cmd + V` 粘贴图片不受影响。

## 实现要点

**AV / BV** — av 号与固定值异或后按 58 进制映射到一张乱序字母表，再交换两位得到 12 位 BV 号。常量已与线上真实稿件的 `aid` / `bvid` 对拍校验。BV 号大小写敏感。

**兽音** — 每个字符转 4 位十六进制，按位置递增的偏移量映射到密钥中两位字符的组合。密钥是 4 个互不相同的字符（默认 `嗷呜啊~`），密文固定为 `key[3] key[1] key[0]` + 正文 + `key[2]`，因此密钥填错时可以从密文反推。只能处理 BMP 内的字符（U+0000–U+FFFF），emoji 会丢失信息。

**佛曰** — 明文 → UTF-16LE 字节 → PKCS#7 补位 → AES-256-CBC（固定密钥）→ 逐字节映射成咒字。因为字节 ≥ 128 时会插入转义字，同一段明文每次加密结果都可能不同。仅支持 V1；V2「如是我闻」额外套了一层 7z(LZMA)，浏览器端没有合适的实现，粘贴进来会给出提示。

**Base64** — 编码前先做 UTF-8 编码，中文和 emoji 都不会乱码。解码时自动忽略换行空格，标准与 URL 安全字母表都能识别，不用手动切换。

**OCR** — tesseract.js v5，识别在浏览器本地完成，图片不出本机。首次使用要从 jsDelivr 下载识别模型（中文约 20 MB），之后被浏览器缓存，可离线使用。语言可切中英 / 中日英 / 英文 / 繁中。

## 联网部分依赖的外部服务

这三个工具依赖外部服务，换环境或换服务商时改对应位置即可：

| 用途 | 依赖 | 在哪改 |
| --- | --- | --- |
| OCR 引擎与模型 | jsDelivr 上的 `tesseract.js@5` 和 `@tesseract.js-data` | `ocr.html` 里的 `<script src>` |
| 图床 | 写死在代码里的地址，需支持 `POST /upload/{key}` 和 `GET /download/{key}` | `js/image.js` 顶部的 `IMAGE_HOST` |
| IP 查询 | 依次尝试 `ipwho.is` → `api.ip.sb/geoip` → `api64.ipify.org`，谁先返回用谁 | `js/ip.js` 顶部的 `SOURCES` |
| WebRTC 泄漏检测 | STUN 服务器 `stun.l.google.com:19302` | `js/ip.js` 的 `probeStun()` |

图片上传到图床后拿到的是**公开链接**，任何人拿到都能访问，别传敏感内容。

## 其他

- 明暗主题跟随系统，右上角的按钮可以手动切换，选择存在 localStorage 里。
- 手机端导航会自动变成底部标签栏，软键盘弹出时收起，避免挡住输入框。
- 根目录的 `old/` 是早期版本的遗留页面，功能已经整合进新结构，确认无误后可以删掉。
