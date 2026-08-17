/**
 * The Ultimate Unako Championship - 画像解析 & OCR モジュール
 */
import { SUB_SKILLS, NATURES } from './scoring.js';

let tesseractWorker = null;

/**
 * Tesseract Worker の初期化
 */
export async function initOCR(onProgress) {
  if (tesseractWorker) return tesseractWorker;
  
  if (typeof Tesseract === 'undefined') {
    throw new Error('Tesseract.js が読み込まれていません');
  }

  tesseractWorker = await Tesseract.createWorker('jpn+eng', 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100));
      }
    }
  });
  return tesseractWorker;
}

/**
 * 文字列の類似度（レーベンシュタイン距離）
 */
function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  s1 = s1.replace(/\s+/g, '');
  s2 = s2.replace(/\s+/g, '');
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

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

/**
 * テキストからサブスキルを同定
 */
export function matchSubSkill(text) {
  if (!text) return null;
  const clean = text.replace(/[\s\r\n\t_・]/g, '');
  let bestMatch = null;
  let bestScore = 0.45; // 類似度閾値

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

/**
 * テキストから性格を同定
 */
export function matchNature(text) {
  if (!text) return null;
  const clean = text.replace(/[\s\r\n\t]/g, '');
  let bestNature = null;
  let bestScore = 0.5;

  for (const nature of NATURES) {
    const sim = similarity(clean, nature.name);
    if (sim > bestScore) {
      bestScore = sim;
      bestNature = nature.name;
    }
  }
  return bestNature;
}

/**
 * テキストからSP数値を抽出
 */
export function extractSP(text) {
  if (!text) return null;
  // "SP 443", "SP443", "SP: 443" などを抽出
  const match = text.match(/SP[:\s]*([0-9]{3,5})/i) || text.match(/([0-9]{3,5})/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 100 && num <= 99999) return num;
  }
  return null;
}

/**
 * 画像からステータス領域を解析
 */
export async function analyzeScreenshot(imageElement, onProgress) {
  const worker = await initOCR(onProgress);

  // 全体OCRを実行
  const { data: { text, lines } } = await worker.recognize(imageElement);
  console.log("OCR Raw Text:", text);

  const result = {
    sp: null,
    pokemonName: "カヌチャン",
    catchType: "kanuchan",
    isShiny: false,
    natureName: null,
    subSkills: [null, null, null, null, null],
    ingredientPattern: "ABB"
  };

  // 1. SPの抽出
  result.sp = extractSP(text);

  // 2. ポケモン名・直取り判定
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

  // 3. 性格の抽出
  for (const line of lines) {
    const matched = matchNature(line.text);
    if (matched) {
      result.natureName = matched;
      break;
    }
  }
  if (!result.natureName) {
    // 全体から探す
    result.natureName = matchNature(text);
  }

  // 4. サブスキルの抽出
  // スキルと思われる行を収集
  const detectedSkills = [];
  for (const line of lines) {
    const matched = matchSubSkill(line.text);
    if (matched && !detectedSkills.includes(matched)) {
      detectedSkills.push(matched);
    }
  }

  // 最大5枠まで埋める
  for (let i = 0; i < 5; i++) {
    if (detectedSkills[i]) {
      result.subSkills[i] = detectedSkills[i];
    }
  }

  // 5. 食材パターンの推定（トマト/リンゴ等の認識）
  if (text.includes("トマト") && text.includes("リンゴ")) {
    result.ingredientPattern = "ABB";
  } else if (text.includes("AAA")) {
    result.ingredientPattern = "AAA";
  }

  return result;
}
