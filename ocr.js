/**
 * The Ultimate Unako Championship - 画像解析 & 高精度OCRモジュール
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
 * 食材の自動検出 (A: トマト, B: カカオ, C: ポテト)
 */
export function extractIngredients(text, lines) {
  // Lv1はカヌチャン系は必ず A (トマト)
  let slot1 = "A";
  let slot30 = "A";
  let slot60 = "A";

  const allText = text.replace(/[\s\r\n]/g, '');

  // カカオやポテトの出現を確認
  const hasCacao = allText.includes("カカオ") || allText.includes("リラックス");
  const hasPotato = allText.includes("ポテト") || allText.includes("じゃがいも") || allText.includes("ほっこり");

  // 出現頻度やキーワードで推定
  if (hasCacao && hasPotato) {
    slot30 = "B";
    slot60 = "C";
  } else if (hasCacao) {
    // カカオが1つか2つか
    const cacaoCount = (allText.match(/カカオ/g) || []).length;
    if (cacaoCount >= 2) {
      slot30 = "B";
      slot60 = "B";
    } else {
      slot30 = "A";
      slot60 = "B";
    }
  } else if (hasPotato) {
    const potatoCount = (allText.match(/ポテト/g) || []).length;
    if (potatoCount >= 2) {
      slot30 = "C";
      slot60 = "C";
    } else {
      slot30 = "A";
      slot60 = "C";
    }
  } else {
    // トマトのみ
    slot1 = "A";
    slot30 = "A";
    slot60 = "A";
  }

  return {
    ingredients: [slot1, slot30, slot60],
    pattern: getIngredientPattern(slot1, slot30, slot60)
  };
}

export async function analyzeScreenshot(imageElement, onProgress) {
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
    ingredients: ["A", "A", "A"],
    ingredientPattern: "AAA"
  };

  // 1. SP
  result.sp = extractSP(text);

  // 2. ポケモン名・直取り
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

  // 3. サブスキル抽出
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

  // 4. 性格
  for (const line of lines) {
    const matched = matchNature(line.text);
    if (matched) {
      result.natureName = matched;
      break;
    }
  }

  // 5. 食材 (A: トマト, B: カカオ, C: ポテト)
  const ingRes = extractIngredients(text, lines);
  result.ingredients = ingRes.ingredients;
  result.ingredientPattern = ingRes.pattern;

  return result;
}
