/**
 * The Ultimate Unako Championship - スコアリングエンジン
 *
 * サブスキル名・性格の効果といった「ゲーム側の事実」は
 * vendor/pokesleep-vision のマスタデータを使う。
 * ここに持つのは大会の配点だけにして、名前を二重管理しないようにしている。
 */
import { SUB_SKILLS as SUB_SKILL_MASTER, NATURES as NATURE_MASTER } from './vendor/pokesleep-vision/gamedata.js?v=15';

// サブスキルの大会配点。isGold は「オール金スキルボーナス」の対象かどうか。
const SUB_SKILL_POINTS = {
  kinomi_s:   { score: 200, isGold: true },
  otebo:      { score: 150, isGold: true },
  suimin_bo:  { score: 150, isGold: true },
  risa_bo:    { score: 80,  isGold: true },
  yume_bo:    { score: 80,  isGold: true },
  gen_bo:     { score: 80,  isGold: true },
  skileve_m:  { score: 80,  isGold: true },
  skileve_s:  { score: 40,  isGold: false },
  speed_m:    { score: 120, isGold: false },
  speed_s:    { score: 80,  isGold: false },
  skill_m:    { score: 80,  isGold: false },
  skill_s:    { score: 40,  isGold: false },
  shokuzai_m: { score: 0,   isGold: false },
  shokuzai_s: { score: 10,  isGold: false },
  shoji_l:    { score: 70,  isGold: false },
  shoji_m:    { score: 50,  isGold: false },
  shoji_s:    { score: 30,  isGold: false }
};

// マスタ（id / name / short / aliases）に大会の配点を合成する
export const SUB_SKILLS = SUB_SKILL_MASTER.map(s => ({
  ...s,
  ...SUB_SKILL_POINTS[s.id]
}));

// 食材定義（A: トマト, B: カカオ, C: じゃがいも）
export const INGREDIENTS = {
  A: { name: "あんみんトマト", short: "トマト", code: "A" },
  B: { name: "リラックスカカオ", short: "カカオ", code: "B" },
  C: { name: "ほっこりポテト", short: "じゃがいも", code: "C" }
};

// カヌチャン系で実際に存在する6通りの食材パターン配点
export const INGREDIENT_SCORES = {
  "AAA": { score: 100, label: "AAA (トマト/トマト/トマト)" },
  "ABB": { score: 60,  label: "ABB (トマト/カカオ/カカオ)" },
  "ABC": { score: 20,  label: "ABC (トマト/カカオ/じゃがいも)" },
  "AAB": { score: 10,  label: "AAB (トマト/トマト/カカオ)" },
  "AAC": { score: 10,  label: "AAC (トマト/トマト/じゃがいも)" },
  "ABA": { score: -30, label: "ギール/ABA (トマト/カカオ/トマト)" },
  "OTHER": { score: 0,  label: "未選択 / その他" }
};

/**
 * 3枠の食材からパターンコードを判定
 */
export function getIngredientPattern(slot1 = "A", slot30 = "A", slot60 = "A") {
  const pattern = `${slot1}${slot30}${slot60}`;
  if (INGREDIENT_SCORES[pattern]) {
    return pattern;
  }
  return "OTHER";
}

// 性格定義（上昇・下降補正と配点）
// short は結果カード用の略称。name をそのまま並べると1行に収まらないため。
export const NATURE_SCORES = {
  up: {
    "speed":      { name: "おてつだいスピード", short: "スピ",   score: 100, label: "スピ↑↑ (+100)" },
    "exp":        { name: "獲得EXP",           short: "EXP",    score: 90,  label: "EXP↑↑ (+90)" },
    "skill":      { name: "メインスキル発生確率", short: "スキル", score: 60,  label: "スキル↑↑ (+60)" },
    "energy":     { name: "げんき回復量",       short: "げんき", score: 40,  label: "げんき↑↑ (+40)" },
    "ingredient": { name: "食材おてつだい確率", short: "食材",   score: 0,   label: "食材↑↑ (+0)" },
    "none":       { name: "なし",               short: "なし",   score: 0,   label: "なし (+0)" }
  },
  down: {
    "ingredient": { name: "食材おてつだい確率", short: "食材",   score: 40,  label: "食材↓↓ (+40)" },
    "energy":     { name: "げんき回復量",       short: "げんき", score: 0,   label: "げんき↓↓ (+0)" },
    "skill":      { name: "メインスキル発生確率", short: "スキル", score: -20, label: "スキル↓↓ (-20)" },
    "exp":        { name: "獲得EXP",           short: "EXP",    score: -30, label: "EXP↓↓ (-30)" },
    "speed":      { name: "おてつだいスピード", short: "スピ",   score: -50, label: "スピ↓↓ (-50)" },
    "none":       { name: "なし",               short: "なし",   score: 0,   label: "なし (+0)" }
  }
};

// 性格一覧（25種類）はマスタをそのまま使う
export const NATURES = NATURE_MASTER;

/**
 * SPボーナス計算
 */
export function calculateSpBonus(sp) {
  if (!sp || isNaN(sp) || sp <= 0) return { score: 0, reason: null };
  const spStr = String(sp);

  if (sp === 777) {
    return { score: 200, reason: "SP 777 ボーナス (+200)" };
  }
  if (spStr.length >= 2 && spStr.split('').every(c => c === spStr[0])) {
    return { score: 100, reason: `SP ゾロ目ボーナス (${sp}) (+100)` };
  }
  if (spStr.length >= 3 && sp % 100 === 0) {
    return { score: 50, reason: `SP キリ番ボーナス (${sp}) (+50)` };
  }
  return { score: 0, reason: null };
}

/**
 * 総合スコア計算関数
 */
export function calculateTotalScore(state) {
  const details = [];
  let totalScore = 0;

  // 1. サブスキル計算 (Lv10, Lv25, Lv50, Lv70, Lv80)
  const slotDiscountRates = [1.0, 1.0, 1.0, 0.9, 0.7]; // Lv70は1割引(0.9), Lv80は3割引(0.7)
  const slotLevels = [10, 25, 50, 70, 80];
  let subSkillTotal = 0;
  const subSkillObjects = [];

  for (let i = 0; i < 5; i++) {
    const skillId = state.subSkills?.[i];
    const skillObj = SUB_SKILLS.find(s => s.id === skillId);
    const rate = slotDiscountRates[i];
    const lv = slotLevels[i];

    if (skillObj) {
      subSkillObjects.push({ ...skillObj, slotIndex: i, lv, rate });
      const baseScore = skillObj.score;
      const discountedScore = Math.round(baseScore * rate);
      subSkillTotal += discountedScore;

      let discountText = "";
      if (rate < 1.0) {
        discountText = ` (Lv.${lv}枠 ${Math.round((1 - rate) * 100)}%引)`;
      }

      details.push({
        category: `サブスキル (Lv.${lv})`,
        name: `${skillObj.name}${discountText}`,
        score: discountedScore
      });
    } else {
      subSkillObjects.push(null);
    }
  }
  totalScore += subSkillTotal;

  // 2. 食材構成
  let ingPattern = state.ingredientPattern;
  if (!ingPattern && state.ingredients) {
    ingPattern = getIngredientPattern(state.ingredients[0], state.ingredients[1], state.ingredients[2]);
  }
  const ingData = INGREDIENT_SCORES[ingPattern] || INGREDIENT_SCORES["OTHER"];
  if (ingData && ingData.score !== 0) {
    details.push({ category: "食材構成", name: ingData.label, score: ingData.score });
    totalScore += ingData.score;
  }

  // 3. 性格補正
  let natureUp = state.natureUp || "none";
  let natureDown = state.natureDown || "none";
  if (state.natureName) {
    const foundNature = NATURES.find(n => n.name === state.natureName);
    if (foundNature) {
      natureUp = foundNature.up;
      natureDown = foundNature.down;
    }
  }
  const upObj = NATURE_SCORES.up[natureUp] || NATURE_SCORES.up["none"];
  const downObj = NATURE_SCORES.down[natureDown] || NATURE_SCORES.down["none"];
  const natureTotal = upObj.score + downObj.score;

  if (state.natureName) {
    details.push({
      category: "性格補正",
      name: `${state.natureName} (${upObj.short}↑↑ / ${downObj.short}↓↓)`,
      score: natureTotal
    });
    totalScore += natureTotal;
  }

  // 4. 色違いボーナス (+350)
  if (state.isShiny) {
    details.push({ category: "特別ボーナス", name: "★ 色違いボーナス", score: 350 });
    totalScore += 350;
  }

  // 5. SPボーナス
  const spBonus = calculateSpBonus(state.sp);
  if (spBonus.score > 0) {
    details.push({ category: "特別ボーナス", name: spBonus.reason, score: spBonus.score });
    totalScore += spBonus.score;
  }

  // 6. 直取りボーナス
  if (state.catchType === "dekanuchan") {
    details.push({ category: "特別ボーナス", name: "デカヌチャン直取りボーナス", score: 150 });
    totalScore += 150;
  } else if (state.catchType === "nakanuchan") {
    details.push({ category: "特別ボーナス", name: "ナカヌチャン直取りボーナス", score: 50 });
    totalScore += 50;
  }

  // 7. FL10以内ボーナス (+100)
  if (state.isFlUnder10) {
    details.push({ category: "特別ボーナス", name: "FL10以内ボーナス", score: 100 });
    totalScore += 100;
  }

  // 8. コンボボーナス
  const validSkills = subSkillObjects.filter(Boolean);
  const validIds = validSkills.map(s => s.id);

  const hasOtebo = validIds.includes("otebo");
  const hasKinomiS = validIds.includes("kinomi_s");
  const hasSuiminBo = validIds.includes("suimin_bo");
  if (hasOtebo && hasKinomiS && hasSuiminBo) {
    const artifactSkills = validSkills.filter(s => ["otebo", "kinomi_s", "suimin_bo"].includes(s.id));
    const minRate = Math.min(...artifactSkills.map(s => s.rate));
    const comboScore = Math.round(100 * minRate);
    const rateText = minRate < 1.0 ? ` (${Math.round((1 - minRate) * 100)}%引適用)` : "";
    details.push({
      category: "コンボボーナス",
      name: `3種の神器ボーナス (おて/きの/睡ボ)${rateText}`,
      score: comboScore
    });
    totalScore += comboScore;
  }

  const hasShojiS = validIds.includes("shoji_s");
  const hasShojiM = validIds.includes("shoji_m");
  const hasShojiL = validIds.includes("shoji_l");
  if (hasShojiS && hasShojiM && hasShojiL) {
    const shojiSkills = validSkills.filter(s => ["shoji_s", "shoji_m", "shoji_l"].includes(s.id));
    const minRate = Math.min(...shojiSkills.map(s => s.rate));
    const comboScore = Math.round(100 * minRate);
    const rateText = minRate < 1.0 ? ` (${Math.round((1 - minRate) * 100)}%引適用)` : "";
    details.push({
      category: "コンボボーナス",
      name: `こてい個体ボーナス (所持数S+M+L)${rateText}`,
      score: comboScore
    });
    totalScore += comboScore;
  }

  if (validSkills.length === 5 && validSkills.every(s => s.isGold)) {
    const minRate = Math.min(...validSkills.map(s => s.rate));
    const comboScore = Math.round(200 * minRate);
    const rateText = minRate < 1.0 ? ` (${Math.round((1 - minRate) * 100)}%引適用)` : "";
    details.push({
      category: "コンボボーナス",
      name: `オール金スキルボーナス${rateText}`,
      score: comboScore
    });
    totalScore += comboScore;
  }

  // 9. リサ配ボーナス (+70)
  if (state.isStreamBonus) {
    details.push({ category: "特別ボーナス", name: "リサ配ボーナス (配信)", score: 70 });
    totalScore += 70;
  }

  return { totalScore, details };
}
