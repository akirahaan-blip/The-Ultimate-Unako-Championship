/**
 * The Ultimate Unako Championship - スクショ解析（大会ルールへの変換）
 *
 * 画面の読み取りそのものは vendor/pokesleep-vision が担当する。
 * ここでやるのは、読み取れた「ゲームの事実」を大会のルールに翻訳することだけ。
 *   ・食材名 → A / B / C のコード
 *   ・ポケモン名 → 直取りボーナスの種別
 *   ・カヌチャンの Lv.1 は必ず あんみんトマト、という前提の適用
 */
import { getIngredientPattern } from './scoring.js?v=8';
import { readStatusScreen, initOCR } from './vendor/pokesleep-vision/index.js?v=8';

export { initOCR };

// 大会で使う食材コード。ライブラリは食材名で返してくるので、ここで対応づける
const INGREDIENT_CODES = {
  'あんみんトマト': 'A',
  'リラックスカカオ': 'B',
  'ほっこりポテト': 'C'
};

// 大会の対象になるポケモン。直取りボーナスの判定に使う
const CATCH_TYPES = {
  'カヌチャン': 'kanuchan',
  'ナカヌチャン': 'nakanuchan',
  'デカヌチャン': 'dekanuchan'
};

/**
 * スクショ1枚から、大会の入力フォームに流し込める形を作る
 */
export async function analyzeScreenshot(imageElement, onProgress, options = {}) {
  const read = await readStatusScreen(imageElement, {
    onProgress,
    onCrop: options.onCrop,
    pokemonNames: Object.keys(CATCH_TYPES),
    verbose: true
  });

  const ingredients = read.ingredients.map(i => INGREDIENT_CODES[i.name] || null);
  // カヌチャン系の Lv.1 は必ず あんみんトマト。
  // ポケモンをタップした時のポップアップに隠れていることも多いので、判定結果より優先する。
  ingredients[0] = 'A';

  const name = read.pokemonName || 'カヌチャン';

  return {
    pokemonName: name,
    catchType: CATCH_TYPES[name] || 'kanuchan',
    isTarget: true,
    isShiny: false,
    sp: read.sp ? read.sp.value : null,
    natureName: read.nature ? read.nature.name : null,
    subSkills: read.subSkills.map(s => s.id),
    ingredients,
    ingredientPattern: getIngredientPattern('A', ingredients[1] || 'A', ingredients[2] || 'A'),
    detected: {
      ingredients: ingredients.filter(Boolean).length,
      subSkills: read.subSkills.filter(s => s.id).length,
      nature: !!read.nature,
      // SPは「SP」の文字ごと読めた時だけ確定。それ以外は時計やバッテリー残量の
      // 可能性があるので要確認あつかいにする
      sp: read.sp ? (read.sp.sure ? 'sure' : 'unsure') : false
    },
    raw: read.raw
  };
}
