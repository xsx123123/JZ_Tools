// 【验证 harness】SSE 帧解析器（src/services/sseParse.ts）的 Node 单测。
// 微信小程序的 onChunkReceived 流式无法在本机（无头 Linux）实测，
// 但「字节流 → delta/事件序列」的纯解析逻辑与平台无关，可用本脚本断言。
//
// 用法：node scripts/verify-stream.mjs   （Node >= 22；本机 Node 24 原生跑 .ts）
import { createFrameParser } from "../src/services/sseParse.ts";

const encoder = new TextEncoder();

/** 把字符串编码成 ArrayBuffer（与小程序端 onChunkReceived 的 res.data 同型） */
function buf(s) {
  return encoder.encode(s).buffer;
}

/** 记录解析出的事件序列 */
function makeRecorder() {
  const events = [];
  const parser = createFrameParser({
    onDelta: (text) => events.push(["delta", text]),
    onTool: (evt) => events.push(["tool", evt.name, evt.status]),
    onCards: (cards) => events.push(["cards", cards.length]),
    onEnd: (p) => events.push(["end", p.cards.length, p.tools.length]),
    onPolariseq: (accession) => events.push(["polariseq", accession]),
    onError: (msg) => events.push(["error", msg]),
  });
  return { events, parser };
}

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}\n       expected: ${e}\n       actual:   ${a}`);
  }
}

/** Case 辅助：push 若干 chunk 后 flush，断言事件序列 */
function runCase(label, chunks, expected) {
  const { events, parser } = makeRecorder();
  for (const c of chunks) parser.push(buf(c));
  parser.flush();
  eq(events, expected, label);
}

console.log("SSE 帧解析验证：");

// 1) 完整帧单 chunk：一帧一行 + 心跳 + [DONE]
runCase(
  "完整帧单 chunk（含心跳与 [DONE]）",
  [': ping\ndata: {"delta":"你好"}\n\ndata: {"delta":"，世界"}\n\ndata: [DONE]\n\n'],
  [
    ["delta", "你好"],
    ["delta", "，世界"],
  ],
);

// 2) 一帧拆两个 chunk：从 JSON 中间切开
runCase(
  "一帧拆两个 chunk（JSON 中间切断）",
  ['data: {"delta":"前半', '后半"}\n\n'],
  [["delta", "前半后半"]],
);

// 3) 两个帧共用一个 chunk
runCase(
  "两个帧共用一个 chunk",
  ['data: {"delta":"A"}\n\ndata: {"event":"tool","name":"seqout_search","label":"搜索","status":"running"}\n\n'],
  [
    ["delta", "A"],
    ["tool", "seqout_search", "running"],
  ],
);

// 4) flush 时尾巴不完整：残留不成行的部分被丢弃/冲刷，不产生半个事件
runCase(
  "flush 时尾巴不完整（半帧冲刷）",
  ['data: {"delta":"完整"}\n\ndata: {"delta":"被切断'],
  [["delta", "完整"]],
);

// 5) flush 时尾巴是完整帧（无结尾换行）：冲刷后仍能解析
runCase(
  "flush 时尾巴是完整帧（无结尾换行）",
  ['data: {"delta":"X"}\n\ndata: {"event":"end","cards":[],"tools":[]}'],
  [
    ["delta", "X"],
    ["end", 0, 0],
  ],
);

// 6) 多字节 UTF-8 从字符中间切开（TextDecoder stream 模式续解）
{
  const full = 'data: {"delta":"中文🐭字符"}\n\n';
  const bytes = encoder.encode(full);
  const cut = 24; // 落在中文/emoji 的多字节序列中间
  const { events, parser } = makeRecorder();
  parser.push(bytes.slice(0, cut).buffer);
  parser.push(bytes.slice(cut).buffer);
  parser.flush();
  eq(events, [["delta", "中文🐭字符"]], "多字节 UTF-8 跨 chunk 切断");
}

// 7) tool/cards/end/error 全事件序列 + 乱序容忍（cards 缺省字段兜底）
runCase(
  "全事件序列（tool→cards→end）",
  [
    'data: {"event":"tool","name":"seqout_search","label":"跨库搜索","status":"done","ms":123}\n\n' +
      'data: {"event":"cards","cards":[{"tool":"seqout_search","accession":"GSE1","title":"t","summary":"s","meta":{}}]}\n\n' +
      'data: {"event":"end","cards":[{"tool":"seqout_search","accession":"GSE1","title":"t","summary":"s","meta":{}}],"tools":[{"name":"seqout_search","label":"跨库搜索","ok":true,"ms":123}]}\n\n',
  ],
  [
    ["tool", "seqout_search", "done"],
    ["cards", 1],
    ["end", 1, 1],
  ],
);

// 8) error 帧与空 delta（delta 为空串不触发 onDelta）
runCase(
  "error 帧 + 空 delta 不触发事件",
  ['data: {"delta":""}\n\ndata: {"error":"后端炸了"}\n\n'],
  [["error", "后端炸了"]],
);

// 9) 行尾是 \r\n（SSE 标准 CRLF）：trim 后照常解析
runCase(
  "CRLF 行尾兼容",
  ['data: {"delta":"CRLF"}\r\n\r\n'],
  [["delta", "CRLF"]],
);

// 10) 连续 push 三次才把一帧拼齐
runCase(
  "一帧拆三个 chunk",
  ['data: {"de', 'lta":"1', '23"}\n\n'],
  [["delta", "123"]],
);

// 11) 下载加速推荐事件：带 accession + accession 为 null 两种路径
runCase(
  "polariseq 事件（带 accession 与 null）",
  [
    'data: {"event":"polariseq","accession":"PRJNA636285"}\n\n' +
      'data: {"event":"polariseq","accession":null}\n\n' +
      'data: {"event":"polariseq"}\n\n',
  ],
  [
    ["polariseq", "PRJNA636285"],
    ["polariseq", null],
    ["polariseq", null],
  ],
);

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
