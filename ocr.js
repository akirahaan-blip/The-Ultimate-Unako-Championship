/**
 * The Ultimate Unako Championship - 画像解析 & 高精度OCR・食材テンプレート照合モジュール
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
 * syokuzai.png から抽出した3食材の基準RGBプロファイル
 * トマト (A): [179, 85, 69]
 * カカオ (B): [164, 109, 58]
 * ポテト (C): [197, 156, 104]
 */
const INGREDIENT_PROFILES = {
  A: { name: "トマト", r: 179, g: 85,  b: 69 },
  B: { name: "カカオ", r: 164, g: 109, b: 58 },
  C: { name: "ポテト", r: 197, g: 156, b: 104 }
};

/**
 * Canvasによるピクセル色距離解析（syokuzai.pngプロファイル照合）
 */
export function detectIngredientsFromCanvas(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;

  // 各スロットの領域
  const slotBoxes = [
    { name: "slot1",  box: [0.44, 0.035, 0.56, 0.175] }, // Lv.1
    { name: "slot30", box: [0.60, 0.100, 0.72, 0.180] }, // Lv.30
    { name: "slot60", box: [0.76, 0.100, 0.88, 0.180] }  // Lv.60
  ];

  const detected = [];

  slotBoxes.forEach((slot, index) => {
    // Lv.1 はカヌチャン系は必ず トマト(A)
    if (index === 0) {
      detected.push("A");
      return;
    }

    const [x1Pct, y1Pct, x2Pct, y2Pct] = slot.box;
    const sx = Math.floor(w * x1Pct);
    const sy = Math.floor(h * y1Pct);
    const sw = Math.floor(w * (x2Pct - x1Pct));
    const sh = Math.floor(h * (y2Pct - y1Pct));

    try {
      const imgData = ctx.getImageData(sx, sy, sw, sh);
      const data = imgData.data;

      let scoreA = 0; // トマト
      let scoreB = 0; // カカオ
      let scoreC = 0; // ポテト

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 背景（暗い色や白・グレー等）を除外
        if (r + g + b < 90 || (Math.abs(r - g) < 15 && Math.abs(g - b) < 15)) {
          continue;
        }

        // 1. トマト判定 (Rが突出して高い: R-G > 60)
        if (r > 150 && (r - g) > 55 && (r - b) > 50) {
          scoreA += 3;
        }
        // 2. じゃがいも判定 (GとBが高く明るい: G > 135, B > 80)
        else if (r > 165 && g > 135 && b > 80 && (r - g) < 55) {
          scoreC += 2.5;
        }
        // 3. カカオ判定 (茶色: R>G>B, Gが控えめ 70〜130, Bが低い < 85)
        else if (r > 120 && g > 70 && g < 135 && b < 85 && r > g && g > b) {
          scoreB += 2.5;
        }
      }

      console.log(`Ingredient ${slot.name} matching scores: A(Tomato)=${scoreA}, B(Cacao)=${scoreB}, C(Potato)=${scoreC}`);

      if (scoreA >= scoreB && scoreA >= scoreC) {
        detected.push("A");
      } else if (scoreB >= scoreA && scoreB >= scoreC) {
        detected.push("B");
      } else {
        detected.push("C");
      }
    } catch (e) {
      console.warn("Canvas getImageData error:", e);
      detected.push("A");
    }
  });

  const slot1 = detected[0] || "A";
  const slot30 = detected[1] || "A";
  const slot60 = detected[2] || "A";
  const pattern = getIngredientPattern(slot1, slot30, slot60);

  return {
    ingredients: [slot1, slot30, slot60],
    pattern
  };
}

export async function analyzeScreenshot(imageElement, onProgress) {
  // 食材色判定（syokuzai.pngプロファイル）
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
  if (text.includes("デカヌチャン")) {
    result.pokemonName = "デカヌチャン";
    result.catchType = "dekanuchan";
  } else if (text.includes("ナカヌチャン")) {
    result.pokemonName = "ナカヌチャン";
    result.catchType = "nakanuchan";
  } else {
    result.pokemonName = "カヌチャン";
    result.catchType = "kanuchan";
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
