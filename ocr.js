/**
 * The Ultimate Unako Championship - スクショ解析モジュール
 *
 * 流れ:
 *   1. layout.js が「緑の見出しバー / ラベルピル」を色で見つけ、各項目の位置を割り出す
 *   2. 食材は ingredients.js が色相ヒストグラムで判定（OCRしない）
 *   3. サブスキル5枠とせいかくだけを、切り出し＋前処理してから Tesseract にかける
 *   4. 読めた文字列は、17種のサブスキル名・25種の性格名という「閉じた候補集合」に
 *      あいまい一致させる
 */
import { SUB_SKILLS, NATURES, getIngredientPattern } from './scoring.js?v=3';
import { detectLayout, readPixels } from './layout.js?v=3';
import { classifyIngredientSlot } from './ingredients.js?v=3';

let tesseractWorker = null;

export async function initOCR(onProgress) {
  if (tesseractWorker) return tesseractWorker;
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js が読み込まれていません');
  }
  tesseractWorker = await Tesseract.createWorker('jpn', 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') onProgress(Math.round(m.progress * 100));
    }
  });
  return tesseractWorker;
}

// ============================================================ 文字列の正規化

// 半角化・長音記号の統一・小書き仮名の統一・漢字とカタカナのそっくりさん対策。
// OCR結果と候補名の両方に同じ処理をかけてから比較する。
const LOOKALIKE = {
  力: 'カ', 口: 'ロ', 二: 'ニ', 卜: 'ト', 夕: 'タ', 工: 'エ', 才: 'オ',
  八: 'ハ', 厶: 'ム', 匕: 'ヒ', 二: 'ニ', 三: 'ミ', 川: 'ル', 沙: 'シ',
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ', ッ: 'ツ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ',
  ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ'
};

export function normalizeText(s) {
  if (!s) return '';
  return s
    // 全角英数を半角に
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // 長音記号のゆれ（ハイフン・罫線・漢数字の一）をすべて 'ー' に寄せる
    .replace(/[‐-―−－ーｰ一-一\-—–―─━]/g, 'ー')
    // 空白・記号を落とす
    .replace(/[\s　_・:：;,.、。'"`|｜()（）\[\]{}<>＜＞!?！？*+=~^\\/]/g, '')
    .replace(/[ぁ-んァ-ヶ一-龠]/g, c => LOOKALIKE[c] || c)
    .replace(/[ァィゥェォッャュョぁぃぅぇぉっゃゅょ]/g, c => LOOKALIKE[c] || c)
    .toUpperCase();
}

function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (!la || !lb) return Math.max(la, lb);
  let prev = new Array(lb + 1);
  let cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    for (let j = 1; j <= lb; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}

/** 0〜1 の類似度。部分一致にも点を与える */
export function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const long = s1.length >= s2.length ? s1 : s2;
  const short = s1.length >= s2.length ? s2 : s1;
  if (short.length >= 3 && long.includes(short)) return 0.90 + 0.08 * (short.length / long.length);
  return 1 - levenshtein(s1, s2) / Math.max(s1.length, s2.length);
}

// ============================================================ 候補への照合

// サブスキルは S / M / L 違いで1文字しか変わらないものが多い。
// 語幹の一致とサイズ文字の一致を分けて評価する。
const SIZE_RE = /([SML])$/;

const SUB_SKILL_KEYS = SUB_SKILLS.map(s => {
  const norm = normalizeText(s.name);
  const m = norm.match(SIZE_RE);
  return {
    id: s.id,
    norm,
    stem: m ? norm.slice(0, -1) : norm,
    size: m ? m[1] : null,
    aliases: (s.aliases || []).map(normalizeText)
  };
});

const NATURE_KEYS = NATURES.map(n => ({ name: n.name, norm: normalizeText(n.name) }));

/** OCRのくずれをサイズ文字に寄せる（5→S など。サブスキル名に数字は出てこない） */
function normalizeSizeChar(c) {
  if (!c) return null;
  const map = { S: 'S', 5: 'S', $: 'S', 8: 'S', M: 'M', N: 'M', H: 'M', L: 'L', 1: 'L', I: 'L', '|': 'L' };
  return map[c] || null;
}

export function matchSubSkill(text) {
  const clean = normalizeText(text).replace(/^LV\.?\d+/i, '');
  if (clean.length < 2) return null;

  const tailSize = normalizeSizeChar(clean.slice(-1));
  const stem = SIZE_RE.test(clean) ? clean.slice(0, -1) : clean;

  let best = null;
  let bestScore = 0;
  for (const key of SUB_SKILL_KEYS) {
    // 語幹の一致を主、フルネーム／別名の一致を従として見る
    let score = Math.max(
      similarity(stem, key.stem) * 0.85 + similarity(clean, key.norm) * 0.15,
      ...key.aliases.map(a => similarity(clean, a) * 0.95)
    );
    // サイズ文字（S/M/L）が読めているなら、それを強く効かせる
    if (key.size && tailSize) score += tailSize === key.size ? 0.10 : -0.18;
    if (score > bestScore) { bestScore = score; best = key; }
  }

  return bestScore >= 0.58 ? { id: best.id, score: bestScore, raw: text } : null;
}

export function matchNature(text) {
  const clean = normalizeText(text);
  if (clean.length < 2) return null;

  let best = null;
  let bestScore = 0;
  for (const key of NATURE_KEYS) {
    const score = similarity(clean, key.norm);
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return bestScore >= 0.60 ? { name: best.name, score: bestScore, raw: text } : null;
}

/**
 * @returns {{value:number, sure:boolean}|null}
 * 「SP」の文字ごと読めた時だけ sure=true。
 * それ以外は時計やバッテリー残量を拾っている可能性があるので、要確認あつかいにする。
 */
export function extractSP(text) {
  if (!text) return null;
  const tagged = normalizeText(text).match(/SP(\d{2,5})/);
  if (tagged) return { value: parseInt(tagged[1], 10), sure: true };
  // 3〜4桁の数字がちょうど1つだけなら、それを候補として採用する
  const numbers = [...new Set((text.match(/\d{3,4}/g) || []).map(n => parseInt(n, 10)))];
  return numbers.length === 1 ? { value: numbers[0], sure: false } : null;
}

// ============================================================ 画像の前処理

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * 矩形を切り出しつつ拡大し、グレースケール＋コントラスト伸長をかける。
 * 未解放サブスキルの薄いグレー文字は、この伸長がないとほぼ読めない。
 */
function cropForOCR(source, box, targetHeight = 130) {
  const sw = Math.max(1, Math.round(box.x1 - box.x0));
  const sh = Math.max(1, Math.round(box.y1 - box.y0));
  const scale = Math.min(6, Math.max(1, targetHeight / sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = makeCanvas(dw, dh);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 余白を白で埋めてから描く（切り出しが画像端をはみ出しても黒くならないように）
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(source, Math.round(box.x0), Math.round(box.y0), sw, sh, 0, 0, dw, dh);

  const img = ctx.getImageData(0, 0, dw, dh);
  const d = img.data;
  const gray = new Uint8Array(dw * dh);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    gray[p] = v;
    hist[v]++;
  }

  // 下位2%／上位2%を捨てた範囲へ引き伸ばす
  const total = dw * dh;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    let v = ((gray[p] - lo) / span) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// 候補名に出てくる文字だけに絞ると、Tesseract の誤読がぐっと減る
function charsetOf(strings, extra = '') {
  return Array.from(new Set((strings.join('') + extra).split(''))).join('');
}
const SUB_SKILL_CHARS = charsetOf(SUB_SKILLS.map(s => s.name), 'SMLー');
const NATURE_CHARS = charsetOf(NATURES.map(n => n.name));
const HEADER_CHARS = 'SPLvリカヌチャンデナ0123456789.';

async function recognize(worker, canvas, { whitelist, singleLine = true }) {
  await worker.setParameters({
    tessedit_pageseg_mode: singleLine ? '7' : '6',
    tessedit_char_whitelist: whitelist || '',
    preserve_interword_spaces: '0',
    user_defined_dpi: '300'
  });
  const res = await worker.recognize(canvas);
  return (res.data.text || '').trim();
}

// ============================================================ 本体

/**
 * スクショ1枚からステータスを読み取る
 * @param {HTMLImageElement} imageElement
 * @param {(pct:number)=>void} [onProgress]
 * @param {{onCrop?:(name:string, canvas:HTMLCanvasElement)=>void}} [options]
 */
export async function analyzeScreenshot(imageElement, onProgress, options = {}) {
  const baseCanvas = makeCanvas(
    imageElement.naturalWidth || imageElement.width,
    imageElement.naturalHeight || imageElement.height
  );
  const ctx = baseCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imageElement, 0, 0);

  const layout = detectLayout(baseCanvas);
  const px = readPixels(baseCanvas);
  layout.notes.forEach(n => console.log('[layout]', n));

  const result = {
    sp: null,
    pokemonName: 'カヌチャン',
    catchType: 'kanuchan',
    isTarget: true,
    isShiny: false,
    natureName: null,
    subSkills: [null, null, null, null, null],
    ingredients: [null, null, null],
    ingredientPattern: null,
    detected: { ingredients: 0, subSkills: 0, nature: false, sp: false },
    raw: {}
  };

  // ---- 食材（OCR不要） ---------------------------------------------------
  layout.ingredientSlots.slice(0, 3).forEach((box, i) => {
    const res = classifyIngredientSlot(px, box);
    result.ingredients[i] = res.code;
    console.log(`[食材] スロット${i + 1}: ${res.name || '判定不可'} (信頼度 ${res.confidence.toFixed(2)}) hist=${res.hist}`);
    if (options.onCrop) options.onCrop(`ing${i + 1}`, cropForOCR(baseCanvas, box, 200));
  });
  // カヌチャン系の Lv.1 は必ず あんみんトマト。
  // ポケモンをタップした時のポップアップに隠れていることも多いので、判定結果より優先する。
  result.ingredients[0] = 'A';
  result.detected.ingredients = result.ingredients.filter(Boolean).length;
  result.ingredientPattern = getIngredientPattern(
    'A', result.ingredients[1] || 'A', result.ingredients[2] || 'A'
  );

  // ---- ここからOCR -------------------------------------------------------
  const worker = await initOCR(onProgress);
  const steps = 1 + layout.subSkillBoxes.filter(Boolean).length + (layout.natureBox ? 1 : 0);
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(Math.round((done / Math.max(1, steps)) * 100)); };

  // 名前とSP
  try {
    const headerCanvas = cropForOCR(baseCanvas, layout.headerBox, 260);
    if (options.onCrop) options.onCrop('header', headerCanvas);
    const headerText = await recognize(worker, headerCanvas, { whitelist: HEADER_CHARS, singleLine: false });
    result.raw.header = headerText;
    console.log('[ヘッダー]', JSON.stringify(headerText));
    const sp = extractSP(headerText);
    if (sp) { result.sp = sp.value; result.detected.sp = sp.sure ? 'sure' : 'unsure'; }
    // 比較用リテラルも同じ normalizeText を通す（小書き仮名の統一などがOCR側にだけ掛かって
    // 一致しなくなる、という事故を避けるため）
    const flat = normalizeText(headerText);
    if (flat.includes(normalizeText('デカヌチャン'))) { result.pokemonName = 'デカヌチャン'; result.catchType = 'dekanuchan'; }
    else if (flat.includes(normalizeText('ナカヌチャン'))) { result.pokemonName = 'ナカヌチャン'; result.catchType = 'nakanuchan'; }
  } catch (e) {
    console.warn('[ヘッダー] 読み取り失敗', e);
  }
  tick();

  // サブスキル5枠
  const slotLevels = [10, 25, 50, 70, 80];
  for (let i = 0; i < 5; i++) {
    const box = layout.subSkillBoxes[i];
    if (!box) { console.log(`[サブスキル Lv.${slotLevels[i]}] 領域を検出できず`); continue; }
    const canvas = cropForOCR(baseCanvas, box);
    if (options.onCrop) options.onCrop(`sub${slotLevels[i]}`, canvas);
    const text = await recognize(worker, canvas, { whitelist: SUB_SKILL_CHARS });
    const matched = matchSubSkill(text);
    result.raw[`sub${slotLevels[i]}`] = text;
    console.log(`[サブスキル Lv.${slotLevels[i]}] "${text}" → ${matched ? matched.id + ' (' + matched.score.toFixed(2) + ')' : '一致なし'}`);
    if (matched) { result.subSkills[i] = matched.id; result.detected.subSkills++; }
    tick();
  }

  // せいかく
  if (layout.natureBox) {
    const canvas = cropForOCR(baseCanvas, layout.natureBox);
    if (options.onCrop) options.onCrop('nature', canvas);
    const text = await recognize(worker, canvas, { whitelist: NATURE_CHARS });
    const matched = matchNature(text);
    result.raw.nature = text;
    console.log(`[せいかく] "${text}" → ${matched ? matched.name + ' (' + matched.score.toFixed(2) + ')' : '一致なし'}`);
    if (matched) { result.natureName = matched.name; result.detected.nature = true; }
    tick();
  }

  if (onProgress) onProgress(100);
  console.log('[結果]', result);
  return result;
}
