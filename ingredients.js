/**
 * The Ultimate Unako Championship - 食材アイコンの判定
 *
 * あんみんトマト(A) / リラックスカカオ(B) / ほっこりポテト(C) は
 * 「色相のヒストグラム」で見分ける。
 *
 *              赤(<18°)  橙(18-34°)  黄(34-58°)  緑(58-190°)
 *   トマト        0.83      0.08        0.04       0.02
 *   カカオ        0.09      0.73        0.09       0.07
 *   ポテト        0.03      0.39        0.56       0.00
 *   (icon_*.png から実測)
 *
 * 未解放スロットのアイコンは白っぽく退色して描画されるが、
 * 退色は彩度を下げるだけで色相はほぼ変えないので、この指標なら影響を受けにくい。
 * 旧実装が「赤い画素の数」を絶対値のしきい値で見ていて未解放スロットを
 * 取りこぼしていたのは、まさにここが原因。
 */

import { isLockBadge } from './layout.js';

const PROTOTYPES = [
  { code: 'A', name: 'あんみんトマト', hist: [0.83, 0.08, 0.04, 0.02] },
  { code: 'B', name: 'リラックスカカオ', hist: [0.09, 0.73, 0.09, 0.07] },
  { code: 'C', name: 'ほっこりポテト', hist: [0.03, 0.39, 0.56, 0.00] }
];

// 彩度がこれ未満の画素は台座のクリーム色・白背景とみなして無視する
const MIN_SAT = 0.10;
const MIN_VAL = 0.20;

// ロック中スロットの「🔒 Lv.30」茶色バッジはカカオと色相が近いので、必ず除外してから数える

function hue(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (!d) return 0;
  let h;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

function hueBin(h) {
  if (h < 18 || h >= 345) return 0; // 赤
  if (h < 34) return 1;             // 橙
  if (h < 58) return 2;             // 黄
  if (h < 190) return 3;            // 緑
  return -1;                        // 青系＝アイコンには出てこない
}

/**
 * スロットの矩形から、アイコン本体だけが写っている行の範囲を絞り込む。
 * 上の「Lv.30」茶色バッジと下の「×2」バッジを巻き込まないための処理。
 */
function findIconRows(px, box) {
  const { w, data } = px;
  const x0 = Math.max(0, Math.round(box.x0));
  const x1 = Math.min(w, Math.round(box.x1));
  const y0 = Math.max(0, Math.round(box.y0));
  const y1 = Math.min(px.h, Math.round(box.y1));
  const bh = y1 - y0;
  if (bh < 8) return null;

  const rowCount = new Float32Array(bh);
  for (let y = 0; y < bh; y++) {
    for (let x = x0; x < x1; x++) {
      const i = ((y0 + y) * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isLockBadge(r, g, b)) continue;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (mx < MIN_VAL * 255) continue;
      if ((mx - mn) / mx < MIN_SAT) continue;
      rowCount[y]++;
    }
  }

  // 途切れごとに塊へ分け、画素数がいちばん多い塊をアイコン本体とみなす
  const gapTol = Math.max(2, Math.round(bh * 0.03));
  const groups = [];
  let start = -1, gap = 0;
  for (let y = 0; y < bh; y++) {
    if (rowCount[y] > 0) { if (start < 0) start = y; gap = 0; }
    else if (start >= 0 && ++gap > gapTol) { groups.push([start, y - gap]); start = -1; gap = 0; }
  }
  if (start >= 0) groups.push([start, bh - 1]);
  if (!groups.length) return null;

  let best = null, bestMass = -1;
  for (const [a, b] of groups) {
    let mass = 0;
    for (let y = a; y <= b; y++) mass += rowCount[y];
    if (mass > bestMass) { bestMass = mass; best = [a, b]; }
  }
  return { x0, x1, y0: y0 + best[0], y1: y0 + best[1] + 1 };
}

/**
 * 1スロットぶんの食材を判定する
 * @returns {{code:'A'|'B'|'C'|null, name:string|null, confidence:number, hist:number[]}}
 */
export function classifyIngredientSlot(px, slotBox) {
  const iconBox = findIconRows(px, slotBox);
  const empty = { code: null, name: null, confidence: 0, hist: [0, 0, 0, 0] };
  if (!iconBox) return empty;

  const { w, data } = px;
  const bins = [0, 0, 0, 0];
  let n = 0;
  for (let y = iconBox.y0; y < iconBox.y1; y++) {
    for (let x = iconBox.x0; x < iconBox.x1; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isLockBadge(r, g, b)) continue;
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (mx < MIN_VAL * 255) continue;
      if ((mx - mn) / mx < MIN_SAT) continue;
      const k = hueBin(hue(r, g, b));
      if (k < 0) continue;
      bins[k]++;
      n++;
    }
  }
  if (n < 40) return empty;

  const hist = bins.map(v => v / n);
  // 各プロトタイプとのL1距離。いちばん近いものを採用する
  let best = null, bestDist = Infinity, secondDist = Infinity;
  for (const p of PROTOTYPES) {
    let d = 0;
    for (let i = 0; i < 4; i++) d += Math.abs(hist[i] - p.hist[i]);
    if (d < bestDist) { secondDist = bestDist; bestDist = d; best = p; }
    else if (d < secondDist) { secondDist = d; }
  }

  return {
    code: best.code,
    name: best.name,
    confidence: Math.max(0, Math.min(1, (secondDist - bestDist) / 1.2)),
    hist: hist.map(v => Number(v.toFixed(3)))
  };
}

/**
 * 検出済みの食材スロット矩形をまとめて判定する
 */
export function classifyIngredients(px, slotBoxes) {
  return slotBoxes.map(box => classifyIngredientSlot(px, box));
}
