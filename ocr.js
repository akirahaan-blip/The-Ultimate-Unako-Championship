/**
 * The Ultimate Unako Championship - 画像解析 & 高精度OCR・食材照合モジュール
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
  
  if (clean.length < 3) return null;
  if (["きのみ", "食材", "スキル", "おてつだい時間", "最大所持数", "メインスキル", "サブスキル", "詳細ステータス", "せいかく"].includes(clean)) {
    return null;
  }

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
  let bestScore = 0.68;

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
  let bestScore = 0.7;

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
  const spMatch = text.match(/SP[\s:：]*([0-9]{3,5})/i);
  if (spMatch) {
    const val = parseInt(spMatch[1], 10);
    if (val >= 100 && val <= 99999) return val;
  }
  return null;
}

/**
 * 食材の精密判定（ゲーム仕様＋鍵アイコン除外色サンプリング）
 * - Lv.1: トマト (A) 固定
 * - Lv.30: トマト (A) or カカオ (B) の2択
 * - Lv.60: トマト (A) or カカオ (B) or じゃがいも (C) の3択
 */
export function detectIngredientsFromCanvas(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;

  // 鍵アイコン（上部・左上）を避けて、食材アイコン中心部（下半分）をサンプリング
  const sampleSlot = (x1Pct, y1Pct, x2Pct, y2Pct) => {
    const sx = Math.floor(w * x1Pct);
    const sy = Math.floor(h * y1Pct);
    const sw = Math.floor(w * (x2Pct - x1Pct));
    const sh = Math.floor(h * (y2Pct - y1Pct));

    try {
      const imgData = ctx.getImageData(sx, sy, sw, sh);
      const data = imgData.data;

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      let redPixels = 0, brownPixels = 0, brightPotatoPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 背景（極端に暗い色や白・透明）を除外
        if (r + g + b < 90 || (r > 240 && g > 240 && b > 240)) continue;

        rSum += r;
        gSum += g;
        bSum += b;
        count++;

        // 赤 (トマト)
        if (r > 150 && (r - g) > 40 && (r - b) > 40) {
          redPixels++;
        }
        // カカオ (濃い茶色: R>G>B, G<=125, 明るすぎない)
        else if (r > 90 && r < 185 && g > 55 && g <= 125 && b < 80 && r > g && g > b) {
          brownPixels++;
        }
        // じゃがいも (断面の明るいベージュ: R>180, G>140, B>90, 明るい)
        else if (r > 175 && g > 140 && b > 85 && (r - g) < 50) {
          brightPotatoPixels++;
        }
      }

      const avgR = count > 0 ? rSum / count : 0;
      const avgG = count > 0 ? gSum / count : 0;
      const avgB = count > 0 ? bSum / count : 0;

      return { avgR, avgG, avgB, redPixels, brownPixels, brightPotatoPixels };
    } catch (e) {
      console.warn("getImageData failed:", e);
      return { avgR: 180, avgG: 80, avgB: 70, redPixels: 10, brownPixels: 0, brightPotatoPixels: 0 };
    }
  };

  // 1. Lv.1 はカヌチャン系は必ず トマト(A)
  const slot1 = "A";

  // 2. Lv.30: トマト (A) か カカオ (B) の2択判定
  // （※カヌチャンのLv30にじゃがいもは存在しない）
  const s30 = sampleSlot(0.61, 0.120, 0.71, 0.175);
  console.log("Slot 30 stats:", s30);
  let slot30 = "A";
  if (s30.brownPixels > s30.redPixels && (s30.avgR - s30.avgG) < 60) {
    slot30 = "B"; // カカオ
  } else {
    slot30 = "A"; // トマト
  }

  // 3. Lv.60: トマト (A) / カカオ (B) / じゃがいも (C) の3択判定
  const s60 = sampleSlot(0.77, 0.120, 0.87, 0.175);
  console.log("Slot 60 stats:", s60);
  let slot60 = "A";

  // トマトの判定: 赤ピクセルが優勢
  if (s60.redPixels > s60.brownPixels && s60.redPixels > s60.brightPotatoPixels && (s60.avgR - s60.avgG) > 45) {
    slot60 = "A"; // トマト
  }
  // じゃがいもの判定: 明るいベージュ色（GとBが高い）
  else if (s60.brightPotatoPixels > s60.brownPixels && s60.avgG > 130 && s60.avgB > 85) {
    slot60 = "C"; // じゃがいも
  }
  // カカオの判定: 濃い茶色
  else {
    slot60 = "B"; // カカオ
  }

  const pattern = getIngredientPattern(slot1, slot30, slot60);
  console.log(`Detected Ingredients: [${slot1}, ${slot30}, ${slot60}] => Pattern: ${pattern}`);

  return {
    ingredients: [slot1, slot30, slot60],
    pattern
  };
}

export async function analyzeScreenshot(imageElement, onProgress) {
  // 食材色判定
  const ingRes = detectIngredientsFromCanvas(imageElement);

  // OCR
  const worker = await initOCR(onProgress);
  const { data: { text, lines } } = await worker.recognize(imageElement);
  console.log("OCR Raw Text Lines:", lines.map(l => l.text));

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

  // SP
  result.sp = extractSP(text);

  // ポケモン名・直取り
  let detectedName = null;
  for (const line of lines) {
    const t = line.text.replace(/[\s\r\n]/g, '');
    const match = t.match(/Lv\.?[0-9]+([^\s0-9:：]+)/i);
    if (match && match[1].length >= 2) {
      detectedName = match[1];
      break;
    }
  }

  if (text.includes("デカヌチャン")) {
    result.pokemonName = "デカヌチャン";
    result.catchType = "dekanuchan";
    result.isTarget = true;
  } else if (text.includes("ナカヌチャン")) {
    result.pokemonName = "ナカヌチャン";
    result.catchType = "nakanuchan";
    result.isTarget = true;
  } else if (text.includes("カヌチャン")) {
    result.pokemonName = "カヌチャン";
    result.catchType = "kanuchan";
    result.isTarget = true;
  } else {
    result.pokemonName = detectedName || "対象外ポケモン";
    result.catchType = "other";
    result.isTarget = false;
  }

  // サブスキル
  let isSubSkillSection = false;
  const detectedSkills = [];

  for (const line of lines) {
    const t = line.text.trim();
    if (t.includes("メインスキル") || t.includes("サブスキル")) {
      isSubSkillSection = true;
      continue;
    }
    if (t.includes("詳細ステータス") || t.includes("せいかく")) {
      isSubSkillSection = false;
    }

    if (isSubSkillSection) {
      const matched = matchSubSkill(t);
      if (matched && !detectedSkills.includes(matched)) {
        detectedSkills.push(matched);
      }
    }
  }

  if (detectedSkills.length === 0) {
    for (const line of lines) {
      const matched = matchSubSkill(line.text);
      if (matched && !detectedSkills.includes(matched)) {
        detectedSkills.push(matched);
      }
    }
  }

  for (let i = 0; i < 5; i++) {
    result.subSkills[i] = detectedSkills[i] || null;
  }

  // 性格
  for (const line of lines) {
    const matched = matchNature(line.text);
    if (matched) {
      result.natureName = matched;
      break;
    }
  }

  return result;
}
