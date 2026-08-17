/**
 * The Ultimate Unako Championship - 高精度個別スロットクロップ & OCRモジュール
 */
import { SUB_SKILLS, NATURES, getIngredientPattern } from './scoring.js';

let tesseractWorker = null;

export async function initOCR(onProgress) {
  if (tesseractWorker) return tesseractWorker;
  
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js が読み込まれていません');
  }

  tesseractWorker = await Tesseract.createWorker('jpn', 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });
  return tesseractWorker;
}

function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = s1.replace(/[\s\r\n\t_・]/g, '');
  s2 = s2.replace(/[\s\r\n\t_・]/g, '');
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) && s2.length >= 3) return 0.9;
  if (s2.includes(s1) && s1.length >= 3) return 0.9;

  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const maxLen = Math.max(len1, len2);
  return 1 - (matrix[len1][len2] / maxLen);
}

export function matchSubSkill(text) {
  if (!text) return null;
  const clean = text.replace(/[\s\r\n\t_・:：]/g, '');
  if (clean.length < 2) return null;

  // 主要キーワード直結判定
  if (clean.includes("きのみの数") || clean.includes("きのみS")) return "kinomi_s";
  if (clean.includes("おてつだいボーナス") || clean.includes("おてぼ")) return "otebo";
  if (clean.includes("睡眠EXP") || clean.includes("睡眠ボーナス") || clean.includes("睡眠ボ")) return "suimin_bo";
  if (clean.includes("リサーチEXP") || clean.includes("リサーチボーナス") || clean.includes("リサボ")) return "risa_bo";
  if (clean.includes("ゆめのかけら") || clean.includes("ゆめボ")) return "yume_bo";
  if (clean.includes("げんき回復") || clean.includes("げんボ")) return "gen_bo";
  
  if (clean.includes("スキルレベルアップM") || clean.includes("スキレベM")) return "skileve_m";
  if (clean.includes("スキルレベルアップS") || clean.includes("スキレベS")) return "skileve_s";
  
  if (clean.includes("おてつだいスピードM") || clean.includes("スピM")) return "speed_m";
  if (clean.includes("おてつだいスピードS") || clean.includes("スピS")) return "speed_s";
  
  if (clean.includes("スキル確率アップM") || clean.includes("スキM")) return "skill_m";
  if (clean.includes("スキル確率アップS") || clean.includes("スキS")) return "skill_s";
  
  if (clean.includes("食材確率アップM") || clean.includes("食材M")) return "shokuzai_m";
  if (clean.includes("食材確率アップS") || clean.includes("食材S")) return "shokuzai_s";
  
  if (clean.includes("最大所持数アップL") || clean.includes("所持L")) return "shoji_l";
  if (clean.includes("最大所持数アップM") || clean.includes("所持M")) return "shoji_m";
  if (clean.includes("最大所持数アップS") || clean.includes("所持S")) return "shoji_s";

  let bestMatch = null;
  let bestScore = 0.55;

  for (const skill of SUB_SKILLS) {
    for (const alias of skill.aliases) {
      const sim = similarity(clean, alias);
      if (sim > bestScore) {
        bestScore = sim;
        bestMatch = skill.id;
      }
    }
  }
  return bestMatch;
}

export function matchNature(text) {
  if (!text) return null;
  const clean = text.replace(/[\s\r\n\t]/g, '');

  for (const nature of NATURES) {
    if (clean.includes(nature.name)) {
      return nature.name;
    }
  }

  let bestNature = null;
  let bestScore = 0.6;

  for (const nature of NATURES) {
    const sim = similarity(clean, nature.name);
    if (sim > bestScore) {
      bestScore = sim;
      bestNature = nature.name;
    }
  }
  return bestNature;
}

export function extractSP(text) {
  if (!text) return null;
  const spMatch = text.match(/SP[\s:：]*([0-9]{3,5})/i) || text.match(/([0-9]{3,4})/);
  if (spMatch) {
    const val = parseInt(spMatch[1], 10);
    if (val >= 100 && val <= 99999) return val;
  }
  return null;
}

/**
 * Canvasから指定領域をクロップしてCanvasとして返すヘルパー
 */
function cropToCanvas(sourceCanvas, xPct, yPct, wPct, hPct) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const sx = Math.floor(w * xPct);
  const sy = Math.floor(h * yPct);
  const sw = Math.floor(w * wPct);
  const sh = Math.floor(h * hPct);

  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  const ctx = crop.getContext("2d");
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop;
}

/**
 * 食材の精密判定（Lv.30はトマトA/カカオB、Lv.60はトマトA/カカオB/ポテトC）
 */
export function detectIngredientsFromCanvas(sourceCanvas) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");

  // サンプル関数
  const sampleSlot = (xPct, yPct, wPct, hPct) => {
    const sx = Math.floor(w * xPct);
    const sy = Math.floor(h * yPct);
    const sw = Math.floor(w * wPct);
    const sh = Math.floor(h * hPct);

    try {
      const imgData = ctx.getImageData(sx, sy, sw, sh);
      const data = imgData.data;

      let redPixels = 0;
      let leafPixels = 0; // カカオの緑の葉っぱ (G > R && G > B + 15)
      let potatoPixels = 0; // ポテトの明るい断面 (R>200, G>180, B>140)

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 1. カカオの緑の葉っぱ
        if (g > r && g > b + 15 && g > 75) {
          leafPixels++;
        }
        // 2. トマトの赤
        else if (r > 190 && (r - g) > 50 && (r - b) > 50) {
          redPixels++;
        }
        // 3. ポテトの明るい白・黄色
        else if (r > 205 && g > 185 && b > 140) {
          potatoPixels++;
        }
      }
      return { redPixels, leafPixels, potatoPixels };
    } catch (e) {
      return { redPixels: 0, leafPixels: 0, potatoPixels: 0 };
    }
  };

  // 1. Lv.1 は必ず トマト (A)
  const slot1 = "A";

  // 2. Lv.30: トマト (A) or カカオ (B)
  const s30 = sampleSlot(0.60, 0.100, 0.12, 0.055);
  console.log("Slot 30 color stats:", s30);
  let slot30 = "A";
  if (s30.leafPixels >= 10 || s30.redPixels < 150) {
    slot30 = "B"; // カカオ
  } else {
    slot30 = "A"; // トマト
  }

  // 3. Lv.60: トマト (A) / カカオ (B) / じゃがいも (C)
  const s60 = sampleSlot(0.77, 0.100, 0.12, 0.055);
  console.log("Slot 60 color stats:", s60);
  let slot60 = "A";
  if (s60.redPixels > 200) {
    slot60 = "A"; // トマト
  } else if (s60.leafPixels >= 10) {
    slot60 = "B"; // カカオ（葉っぱあり）
  } else if (s60.potatoPixels > 500) {
    slot60 = "C"; // じゃがいも
  } else {
    slot60 = "B"; // カカオ
  }

  const pattern = getIngredientPattern(slot1, slot30, slot60);
  return {
    ingredients: [slot1, slot30, slot60],
    pattern
  };
}

/**
 * メイン解析処理: 個別スロットクロップ & 高速認識
 */
export async function analyzeScreenshot(imageElement, onProgress) {
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = imageElement.naturalWidth || imageElement.width;
  baseCanvas.height = imageElement.naturalHeight || imageElement.height;
  const ctx = baseCanvas.getContext("2d");
  ctx.drawImage(imageElement, 0, 0);

  // 1. 食材の判定
  const ingRes = detectIngredientsFromCanvas(baseCanvas);

  // 2. Tesseract Worker 起動
  const worker = await initOCR(onProgress);

  const result = {
    sp: null,
    pokemonName: "カヌチャン",
    catchType: "kanuchan",
    isShiny: false,
    natureName: null,
    subSkills: [null, null, null, null, null],
    ingredients: ingRes.ingredients,
    ingredientPattern: ingRes.pattern
  };

  // 3. 上部ヘッダー（SP・名前）の個別OCR
  const headerCanvas = cropToCanvas(baseCanvas, 0.05, 0.04, 0.55, 0.10);
  const headerRes = await worker.recognize(headerCanvas);
  const headerText = headerRes.data.text;
  console.log("Header OCR:", headerText);

  result.sp = extractSP(headerText);

  if (headerText.includes("デカヌチャン")) {
    result.pokemonName = "デカヌチャン";
    result.catchType = "dekanuchan";
    result.isTarget = true;
  } else if (headerText.includes("ナカヌチャン")) {
    result.pokemonName = "ナカヌチャン";
    result.catchType = "nakanuchan";
    result.isTarget = true;
  } else if (headerText.includes("カヌチャン")) {
    result.pokemonName = "カヌチャン";
    result.catchType = "kanuchan";
    result.isTarget = true;
  } else {
    result.pokemonName = "カヌチャン";
    result.catchType = "kanuchan";
    result.isTarget = true;
  }

  // 4. サブスキル 5枠の個別ピンポイントOCR
  // Lv10: 左上 (x: 6-48%, y: 50.5-56.5%)
  // Lv25: 右上 (x: 52-94%, y: 50.5-56.5%)
  // Lv50: 左中 (x: 6-48%, y: 57.0-63.0%)
  // Lv70: 右中 (x: 52-94%, y: 57.0-63.0%)
  // Lv80: 左下 (x: 6-48%, y: 63.5-70.0%)
  const subSlots = [
    { slotIndex: 0, lv: 10, box: [0.06, 0.505, 0.43, 0.060] },
    { slotIndex: 1, lv: 25, box: [0.51, 0.505, 0.43, 0.060] },
    { slotIndex: 2, lv: 50, box: [0.06, 0.570, 0.43, 0.060] },
    { slotIndex: 3, lv: 70, box: [0.51, 0.570, 0.43, 0.060] },
    { slotIndex: 4, lv: 80, box: [0.06, 0.635, 0.43, 0.060] }
  ];

  for (let i = 0; i < subSlots.length; i++) {
    const s = subSlots[i];
    const slotCanvas = cropToCanvas(baseCanvas, s.box[0], s.box[1], s.box[2], s.box[3]);
    const slotRes = await worker.recognize(slotCanvas);
    const slotText = slotRes.data.text.trim();
    const matched = matchSubSkill(slotText);
    console.log(`SubSlot Lv.${s.lv} Raw: "${slotText}" => Matched: ${matched}`);
    result.subSkills[s.slotIndex] = matched || null;
  }

  // 5. 性格領域の個別ピンポイントOCR (y: 80%〜90% 付近)
  const natureCanvas = cropToCanvas(baseCanvas, 0.06, 0.81, 0.45, 0.08);
  const natureRes = await worker.recognize(natureCanvas);
  const natureText = natureRes.data.text.trim();
  console.log("Nature Raw:", natureText);
  result.natureName = matchNature(natureText);

  if (!result.natureName) {
    // 画面下部広範囲からフォールバック
    const natureCanvasWide = cropToCanvas(baseCanvas, 0.05, 0.78, 0.90, 0.12);
    const natureResWide = await worker.recognize(natureCanvasWide);
    result.natureName = matchNature(natureResWide.data.text);
  }

  console.log("Final Analyzed Result:", result);
  return result;
}
