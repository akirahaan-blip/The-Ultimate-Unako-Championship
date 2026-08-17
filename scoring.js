/**
 * The Ultimate Unako Championship - スコアリングエンジン
 */

// サブスキルの定義と基本点
export const SUB_SKILLS = [
  { id: "kinomi_s", name: "きのみの数S", score: 200, isGold: true, aliases: ["きのみの数S", "きのみS", "きのみの数"] },
  { id: "otebo", name: "おてつだいボーナス", score: 150, isGold: true, aliases: ["おてつだいボーナス", "おてぼ"] },
  { id: "suimin_bo", name: "睡眠EXPボーナス", score: 150, isGold: true, aliases: ["睡眠EXPボーナス", "睡眠ボーナス", "睡眠ボ"] },
  { id: "risa_bo", name: "リサーチEXPボーナス", score: 80, isGold: true, aliases: ["リサーチEXPボーナス", "リサーチボーナス", "リサボ"] },
  { id: "yume_bo", name: "ゆめのかけらボーナス", score: 80, isGold: true, aliases: ["ゆめのかけらボーナス", "ゆめボ"] },
  { id: "gen_bo", name: "げんき回復ボーナス", score: 80, isGold: true, aliases: ["げんき回復ボーナス", "げんボ"] },
  { id: "skileve_m", name: "スキルレベルアップM", score: 80, isGold: true, aliases: ["スキルレベルアップM", "スキレベM"] },
  { id: "skileve_s", name: "スキルレベルアップS", score: 40, isGold: false, upgradeTo: "skileve_m", aliases: ["スキルレベルアップS", "スキレベS"] },
  { id: "speed_m", name: "おてつだいスピードM", score: 120, isGold: false, aliases: ["おてつだいスピードM", "スピM", "おてスピM"] },
  { id: "speed_s", name: "おてつだいスピードS", score: 80, isGold: false, upgradeTo: "speed_m", aliases: ["おてつだいスピードS", "スピS", "おてスピS"] },
  { id: "skill_m", name: "スキル確率アップM", score: 80, isGold: false, aliases: ["スキル確率アップM", "スキM", "スキル確率M"] },
  { id: "skill_s", name: "スキル確率アップS", score: 40, isGold: false, upgradeTo: "skill_m", aliases: ["スキル確率アップS", "スキS", "スキル確率S"] },
  { id: "shokuzai_m", name: "食材確率アップM", score: 10, isGold: false, aliases: ["食材確率アップM", "食材M"] },
  { id: "shokuzai_s", name: "食材確率アップS", score: 0, isGold: false, upgradeTo: "shokuzai_m", aliases: ["食材確率アップS", "食材S"] },
  { id: "shoji_l", name: "最大所持数アップL", score: 70, isGold: false, aliases: ["最大所持数アップL", "所持L"] },
  { id: "shoji_m", name: "最大所持数アップM", score: 50, isGold: false, upgradeTo: "shoji_l", aliases: ["最大所持数アップM", "所持M"] },
  { id: "shoji_s", name: "最大所持数アップS", score: 30, isGold: false, upgradeTo: "shoji_m", aliases: ["最大所持数アップS", "所持S"] }
];

// 食材構成配点
export const INGREDIENT_SCORES = {
  "AAA": { score: 100, label: "AAA (同種3つ)" },
  "ABB": { score: 60,  label: "ABB" },
  "ABC": { score: 20,  label: "ABC (3種別)" },
  "AAB": { score: 10,  label: "AAB" },
  "AAC": { score: 10,  label: "AAC" },
  "OIL": { score: -30, label: "ギール (-30)" }, // ピュアなオイル等
  "OTHER": { score: 0, label: "その他" }
};

// 性格定義（上昇・下降補正と配点）
export const NATURE_SCORES = {
  up: {
    "speed": { name: "おてつだいスピード", score: 100, label: "スピ↑↑ (+100)" },
    "exp": { name: "獲得EXP", score: 90, label: "EXP↑↑ (+90)" },
    "skill": { name: "メインスキル発生確率", score: 60, label: "スキル↑↑ (+60)" },
    "energy": { name: "げんき回復量", score: 40, label: "げんき↑↑ (+40)" },
    "ingredient": { name: "食材おてつだい確率", score: 0, label: "食材↑↑ (+0)" },
    "none": { name: "なし", score: 0, label: "なし (+0)" }
  },
  down: {
    "ingredient": { name: "食材おてつだい確率", score: 40, label: "食材↓↓ (+40)" },
    "energy": { name: "げんき回復量", score: 0, label: "げんき↓↓ (+0)" },
    "skill": { name: "メインスキル発生確率", score: -20, label: "スキル↓↓ (-20)" },
    "exp": { name: "獲得EXP", score: -30, label: "EXP↓↓ (-30)" },
    "speed": { name: "おてつだいスピード", score: -50, label: "スピ↓↓ (-50)" },
    "none": { name: "なし", score: 0, label: "なし (+0)" }
  }
};

// 性格一覧（25種類）
export const NATURES = [
  { name: "さみしがり", up: "speed", down: "energy" },
  { name: "いじっぱり", up: "speed", down: "ingredient" },
  { name: "やんちゃ",   up: "speed", down: "skill" },
  { name: "ゆうかん",   up: "speed", down: "exp" },
  { name: "ずぶとい",   up: "energy", down: "speed" },
  { name: "わんぱく",   up: "energy", down: "ingredient" },
  { name: "のうてんき", up: "energy", down: "skill" },
  { name: "のんき",     up: "energy", down: "exp" },
  { name: "ひかえめ",   up: "ingredient", down: "speed" },
  { name: "おっとり",   up: "ingredient", down: "energy" },
  { name: "うっかりや", up: "ingredient", down: "skill" },
  { name: "れいせい",   up: "ingredient", down: "exp" },
  { name: "おだやか",   up: "skill", down: "speed" },
  { name: "おとなしい", up: "skill", down: "energy" },
  { name: "しんちょう", up: "skill", down: "ingredient" },
  { name: "なまいき",   up: "skill", down: "exp" },
  { name: "おくびょう", up: "exp", down: "speed" },
  { name: "せっかち",   up: "exp", down: "energy" },
  { name: "ようき",     up: "exp", down: "ingredient" },
  { name: "むじゃき",   up: "exp", down: "skill" },
  { name: "てれや",     up: "none", down: "none" },
  { name: "がんばりや", up: "none", down: "none" },
  { name: "すなお",     up: "none", down: "none" },
  { name: "きまぐれ",   up: "none", down: "none" },
  { name: "まじめ",     up: "none", down: "none" }
];

/**
 * SPボーナス計算
 */
export function calculateSpBonus(sp) {
  if (!sp || isNaN(sp) || sp <= 0) return { score: 0, reason: null };
  const spStr = String(sp);

  // SP 777
  if (sp === 777) {
    return { score: 200, reason: "SP 777 ボーナス (+200)" };
  }

  // ゾロ目 (例: 111, 222, 333, 444, 555, 666, 888, 999, 1111など)
  if (spStr.length >= 2 && spStr.split('').every(c => c === spStr[0])) {
    return { score: 100, reason: `SP ゾロ目ボーナス (${sp}) (+100)` };
  }

  // キリ番 (下2桁以上が00: 100, 200, 500, 1000等)
  if (spStr.length >= 3 && sp % 100 === 0) {
    return { score: 50, reason: `SP キリ番ボーナス (${sp}) (+50)` };
  }

  return { score: 0, reason: null };
}

/**
 * 総合スコア計算関数
 * @param {Object} state - 計算対象の個体ステータス
 * @returns {Object} 詳細スコア内訳
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
      let baseScore = skillObj.score;
      
      // 銀種使用フラグがある場合
      const isSilverSeeded = state.silverSeeds?.[i] === true;
      let finalSkillScore = baseScore;

      if (isSilverSeeded && skillObj.upgradeTo) {
        const upgradedObj = SUB_SKILLS.find(s => s.id === skillObj.upgradeTo);
        if (upgradedObj) {
          const diff = upgradedObj.score - baseScore;
          finalSkillScore = baseScore + Math.round(diff / 2); // 加点分半減
        }
      }

      // Lv割引適用
      const discountedScore = Math.round(finalSkillScore * rate);
      subSkillTotal += discountedScore;

      let discountText = "";
      if (rate < 1.0) {
        discountText = ` (Lv.${lv}枠 ${Math.round((1 - rate) * 100)}%引)`;
      }
      if (isSilverSeeded) {
        discountText += " [銀種]";
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
  const ingPattern = state.ingredientPattern || "OTHER";
  const ingData = INGREDIENT_SCORES[ingPattern] || INGREDIENT_SCORES["OTHER"];
  if (ingData.score !== 0) {
    details.push({
      category: "食材構成",
      name: ingData.label,
      score: ingData.score
    });
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

  if (natureTotal !== 0 || state.natureName) {
    const natLabel = state.natureName ? `性格: ${state.natureName}` : "性格補正";
    details.push({
      category: "性格補正",
      name: `${natLabel} (${upObj.name}↑ / ${downObj.name}↓)`,
      score: natureTotal
    });
    totalScore += natureTotal;
  }

  // 4. 色違いボーナス (+350)
  if (state.isShiny) {
    details.push({
      category: "特別ボーナス",
      name: "★ 色違いボーナス",
      score: 350
    });
    totalScore += 350;
  }

  // 5. SPボーナス
  const spBonus = calculateSpBonus(state.sp);
  if (spBonus.score > 0) {
    details.push({
      category: "特別ボーナス",
      name: spBonus.reason,
      score: spBonus.score
    });
    totalScore += spBonus.score;
  }

  // 6. 直取りボーナス
  if (state.catchType === "dekanuchan") {
    details.push({
      category: "特別ボーナス",
      name: "デカヌチャン直取りボーナス",
      score: 150
    });
    totalScore += 150;
  } else if (state.catchType === "nakanuchan") {
    details.push({
      category: "特別ボーナス",
      name: "ナカヌチャン直取りボーナス",
      score: 50
    });
    totalScore += 50;
  }

  // 7. FL10以内ボーナス (+100)
  if (state.isFlUnder10) {
    details.push({
      category: "特別ボーナス",
      name: "FL10以内ボーナス",
      score: 100
    });
    totalScore += 100;
  }

  // 8. コンボ・スキル構成ボーナス
  const validSkills = subSkillObjects.filter(Boolean);
  const validIds = validSkills.map(s => s.id);

  // (A) 3種の神器 (おてぼ・きのみS・睡眠ボ)
  const hasOtebo = validIds.includes("otebo");
  const hasKinomiS = validIds.includes("kinomi_s");
  const hasSuiminBo = validIds.includes("suimin_bo");
  if (hasOtebo && hasKinomiS && hasSuiminBo) {
    // 該当する3スキルのうち一番割引率が高い(最も低い倍率)スロットの割引を適用
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

  // (B) こてい個体ボーナス (所持数S, M, L すべて所持)
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

  // (C) オール金スキルボーナス (+200)
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
    details.push({
      category: "特別ボーナス",
      name: "リサ配ボーナス (配信)",
      score: 70
    });
    totalScore += 70;
  }

  return {
    totalScore,
    details
  };
}
