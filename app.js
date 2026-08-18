/**
 * The Ultimate Unako Championship - メインアプリケーション制御
 */
import {
  SUB_SKILLS,
  INGREDIENTS,
  INGREDIENT_SCORES,
  getIngredientPattern,
  NATURE_SCORES,
  NATURES,
  calculateTotalScore
} from './scoring.js?v=9';
import { analyzeScreenshot } from './ocr.js?v=9';
import { buildPostText, copyPostText, downloadScoreImage } from './share.js?v=9';

// 現在の状態
let state = {
  pokemonName: "カヌチャン",
  catchType: "kanuchan", // "kanuchan" | "nakanuchan" | "dekanuchan"
  isShiny: false,
  sp: 0,
  ingredients: ["A", "A", "A"], // Lv.1, Lv.30, Lv.60 (A: トマト, B: カカオ, C: じゃがいも)
  ingredientPattern: "AAA",
  natureName: "",
  subSkills: [null, null, null, null, null],
  isFlUnder10: false,
  isStreamBonus: false
};

const STORAGE_KEY = "unako_championship_history_v1";

// DOM要素
const uploadCard = document.getElementById("uploadCard");
const fileInput = document.getElementById("fileInput");
const ocrProgress = document.getElementById("ocrProgress");
const progressBar = document.getElementById("progressBar");
const progressLabel = document.getElementById("progressLabel");

const scoreValEl = document.getElementById("scoreVal");
const breakdownGridEl = document.getElementById("breakdownGrid");
const bonusTagsEl = document.getElementById("bonusTags");
const cardPokemonNameEl = document.getElementById("cardPokemonName");
const cardSpEl = document.getElementById("cardSp");

const pokemonSelect = document.getElementById("pokemonSelect");
const spInput = document.getElementById("spInput");
const ingSlot1 = document.getElementById("ingSlot1");
const ingSlot30 = document.getElementById("ingSlot30");
const ingSlot60 = document.getElementById("ingSlot60");
const natureSelect = document.getElementById("natureSelect");
const shinyCheck = document.getElementById("shinyCheck");
const flCheck = document.getElementById("flCheck");
const streamCheck = document.getElementById("streamCheck");
const subSkillContainer = document.getElementById("subSkillContainer");
const historyListEl = document.getElementById("historyList");
const saveHistoryBtn = document.getElementById("saveHistoryBtn");
const clearBtn = document.getElementById("clearBtn");
const shareImgBtn = document.getElementById("shareImgBtn");
const shareTxtBtn = document.getElementById("shareTxtBtn");
const postTextEl = document.getElementById("postText");

/**
 * 初期化処理
 */
function init() {
  renderFormControls();
  bindEvents();
  updateUIFromState();
  recalculateAndRender();
  renderHistory();
}

/**
 * フォームコントロール生成
 */
function renderFormControls() {
  // 性格セレクト
  natureSelect.innerHTML = `<option value="">-- 選択してください --</option>` +
    NATURES.map(n => {
      const upObj = NATURE_SCORES.up[n.up] || { name: "なし", score: 0 };
      const downObj = NATURE_SCORES.down[n.down] || { name: "なし", score: 0 };
      const total = upObj.score + downObj.score;
      const sign = total > 0 ? `+${total}` : total;
      return `<option value="${n.name}">${n.name} (${upObj.name}↑ / ${downObj.name}↓ : ${sign}点)</option>`;
    }).join('');

  // サブスキル5スロット
  const slotLabels = [
    { lv: 10, discount: "" },
    { lv: 25, discount: "" },
    { lv: 50, discount: "" },
    { lv: 70, discount: " (1割引)" },
    { lv: 80, discount: " (3割引)" }
  ];

  subSkillContainer.innerHTML = slotLabels.map((slot, i) => {
    const isDiscount = i >= 3;
    return `
      <div class="skill-row">
        <div class="skill-lv-badge ${isDiscount ? 'discount' : ''}">Lv.${slot.lv}${slot.discount}</div>
        <select class="skill-select" data-slot="${i}">
          <option value="">-- なし --</option>
          ${SUB_SKILLS.map(s => {
            const goldBadge = s.isGold ? '★ ' : '';
            return `<option value="${s.id}">${goldBadge}${s.name} (+${s.score}点)</option>`;
          }).join('')}
        </select>
      </div>
    `;
  }).join('');
}

/**
 * イベント登録
 */
function bindEvents() {
  // 画像アップロード & ドロップ
  uploadCard.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadCard.classList.add("dragover");
  });
  uploadCard.addEventListener("dragleave", () => uploadCard.classList.remove("dragover"));
  uploadCard.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadCard.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  });

  // フォーム入力変更監視
  pokemonSelect.addEventListener("change", (e) => {
    state.catchType = e.target.value;
    const nameMap = {
      kanuchan: "カヌチャン",
      nakanuchan: "ナカヌチャン",
      dekanuchan: "デカヌチャン",
      other: "対象外ポケモン"
    };
    state.pokemonName = nameMap[e.target.value] || "カヌチャン";
    recalculateAndRender();
  });

  spInput.addEventListener("input", (e) => {
    state.sp = parseInt(e.target.value, 10) || 0;
    recalculateAndRender();
  });

  // 食材スロット変更
  const updateIngredientsFromSlots = () => {
    state.ingredients = ["A", ingSlot30.value, ingSlot60.value];
    state.ingredientPattern = getIngredientPattern("A", ingSlot30.value, ingSlot60.value);
    updateIngredientBadges();
    recalculateAndRender();
  };
  ingSlot30.addEventListener("change", updateIngredientsFromSlots);
  ingSlot60.addEventListener("change", updateIngredientsFromSlots);

  natureSelect.addEventListener("change", (e) => {
    state.natureName = e.target.value;
    recalculateAndRender();
  });

  shinyCheck.addEventListener("change", (e) => {
    state.isShiny = e.target.checked;
    recalculateAndRender();
  });

  flCheck.addEventListener("change", (e) => {
    state.isFlUnder10 = e.target.checked;
    recalculateAndRender();
  });

  streamCheck.addEventListener("change", (e) => {
    state.isStreamBonus = e.target.checked;
    recalculateAndRender();
  });

  // サブスキル変更
  subSkillContainer.querySelectorAll(".skill-select").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const slot = parseInt(e.target.dataset.slot, 10);
      state.subSkills[slot] = e.target.value || null;
      recalculateAndRender();
    });
  });

  // X投稿用の書き出し
  shareImgBtn.addEventListener("click", async () => {
    const label = shareImgBtn.textContent;
    shareImgBtn.disabled = true;
    shareImgBtn.textContent = "🖼️ 作成中...";
    try {
      await downloadScoreImage(state, calculateTotalScore(state));
      shareImgBtn.textContent = "✓ 保存しました";
    } catch (err) {
      console.error(err);
      shareImgBtn.textContent = "※ 保存に失敗";
    }
    setTimeout(() => { shareImgBtn.textContent = label; shareImgBtn.disabled = false; }, 1800);
  });

  shareTxtBtn.addEventListener("click", async () => {
    const label = shareTxtBtn.textContent;
    const text = buildPostText(state, calculateTotalScore(state));
    const ok = await copyPostText(text, postTextEl);
    shareTxtBtn.textContent = ok ? "✓ コピーしました" : "下の文をコピーしてください";
    setTimeout(() => { shareTxtBtn.textContent = label; }, 1800);
  });

  // 履歴保存
  saveHistoryBtn.addEventListener("click", () => {
    saveToHistory();
  });

  // クリア
  clearBtn.addEventListener("click", () => {
    resetState();
    updateUIFromState();
    recalculateAndRender();
  });
}

function resetState() {
  state = {
    pokemonName: "カヌチャン",
    catchType: "kanuchan",
    isShiny: false,
    sp: 0,
    ingredients: ["A", "A", "A"],
    ingredientPattern: "AAA",
    natureName: "",
    subSkills: [null, null, null, null, null],
    isFlUnder10: false,
    isStreamBonus: false
  };
}

/**
 * 画像解析処理
 */
async function handleImageUpload(file) {
  ocrProgress.style.display = "block";
  progressBar.style.width = "10%";
  progressLabel.textContent = "画像を準備中...";

  try {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = async (e) => {
      img.src = e.target.result;
      img.onload = async () => {
        progressLabel.textContent = "AIでステータスを読み取り中...";
        try {
          const detected = await analyzeScreenshot(img, (pct) => {
            progressBar.style.width = `${pct}%`;
            progressLabel.textContent = `解析中... ${pct}%`;
          });

          resetState();

          if (detected.sp) state.sp = detected.sp;
          if (detected.catchType) {
            state.catchType = detected.catchType;
            state.pokemonName = detected.pokemonName;
          }
          if (detected.natureName) state.natureName = detected.natureName;
          // 読めなかった枠は既定値（Lv.1〜60ともトマト）のままにしておく
          state.ingredients = ["A", detected.ingredients[1] || "A", detected.ingredients[2] || "A"];
          state.ingredientPattern = getIngredientPattern(...state.ingredients);
          state.subSkills = detected.subSkills;

          updateUIFromState();
          recalculateAndRender();
          renderOcrSummary(detected);

          progressLabel.textContent = "✓ 自動読み取り完了！下の内容を確認してください";
          setTimeout(() => {
            ocrProgress.style.display = "none";
          }, 2400);
        } catch (err) {
          console.error(err);
          progressLabel.textContent = "※ 解析エラー（手動で調整できます）";
        }
      };
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error(err);
    ocrProgress.style.display = "none";
  }
}

const SLOT_LEVELS = [10, 25, 50, 70, 80];

// ハイビスカスランプの点灯条件。どちらも「その点数以上」で成立する
const LAMP_THRESHOLD = 900;       // 左右が交互に点滅
const LAMP_SOLO_THRESHOLD = 1000; // 左だけ点滅（沖ドキの「左のみ」）
let lampTier = 0;

/**
 * ヘッダーのハイビスカスランプを点けたり消したりする。
 * 消灯中は display:none なので、点くたびに出現アニメーションが頭から流れる。
 */
function updateLamps(totalScore) {
  const lamps = [document.getElementById("lampLeft"), document.getElementById("lampRight")];
  if (lamps.some(el => !el)) return;

  const tier =
    totalScore >= LAMP_SOLO_THRESHOLD ? 2 :
    totalScore >= LAMP_THRESHOLD ? 1 : 0;
  if (tier === lampTier) return;
  lampTier = tier;

  lamps.forEach(el => {
    el.classList.toggle("lit", tier > 0);
    el.classList.toggle("solo", tier === 2);
  });
}

/**
 * 何がスクショから読めて、何が読めなかったのかを一覧で出す。
 * OCRは完璧にはならないので、ユーザーがどこを直せばいいか一目で分かるようにする。
 */
function renderOcrSummary(detected) {
  const el = document.getElementById("ocrSummary");
  if (!el) return;

  const rows = [];
  const ing = detected.ingredients;
  rows.push({
    label: "食材",
    ok: ing[1] && ing[2],
    text: ["トマト", ...ing.slice(1).map(c => (c ? INGREDIENTS[c].short : "？"))].join(" / ")
  });
  SLOT_LEVELS.forEach((lv, i) => {
    const skill = SUB_SKILLS.find(s => s.id === detected.subSkills[i]);
    rows.push({ label: `Lv.${lv}`, ok: !!skill, text: skill ? skill.name : "読み取れず" });
  });
  rows.push({
    label: "せいかく",
    ok: !!detected.natureName,
    text: detected.natureName || "読み取れず"
  });
  rows.push({
    label: "SP",
    ok: detected.detected.sp === "sure",
    text: detected.sp
      ? `${detected.sp}${detected.detected.sp === "unsure" ? "（要確認）" : ""}`
      : "読み取れず"
  });

  const ngCount = rows.filter(r => !r.ok).length;
  el.innerHTML = `
    <div class="ocr-summary-head">
      📋 読み取り結果${ngCount ? `<span class="ocr-warn">${ngCount}件は下のフォームで確認してください</span>` : "<span class='ocr-ok-all'>すべて読み取れました</span>"}
    </div>
    <div class="ocr-summary-grid">
      ${rows.map(r => `
        <div class="ocr-summary-item ${r.ok ? "" : "ng"}">
          <span class="ocr-key">${r.ok ? "✓" : "！"} ${r.label}</span>
          <span class="ocr-val">${r.text}</span>
        </div>
      `).join("")}
    </div>
  `;
  el.style.display = "block";
}

const ING_IMG_MAP = {
  A: { src: "icon_tomato.png", name: "トマト" },
  B: { src: "icon_cacao.png", name: "カカオ" },
  C: { src: "icon_potato.png", name: "じゃがいも" }
};

function updateIngredientBadges() {
  const ing1 = ING_IMG_MAP[state.ingredients[0] || "A"];
  const ing30 = ING_IMG_MAP[state.ingredients[1] || "A"];
  const ing60 = ING_IMG_MAP[state.ingredients[2] || "A"];

  const b1 = document.getElementById("ingBadge1");
  const b30 = document.getElementById("ingBadge30");
  const b60 = document.getElementById("ingBadge60");

  if (b1) b1.innerHTML = `<img src="${ing1.src}" class="ing-mini-img"> <span>Lv.1 ${ing1.name}</span>`;
  if (b30) b30.innerHTML = `<img src="${ing30.src}" class="ing-mini-img"> <span>Lv.30 ${ing30.name}</span>`;
  if (b60) b60.innerHTML = `<img src="${ing60.src}" class="ing-mini-img"> <span>Lv.60 ${ing60.name}</span>`;
}

/**
 * 状態をUIフォームへ反映
 */
function updateUIFromState() {
  pokemonSelect.value = state.catchType;
  spInput.value = state.sp || "";
  
  // 食材スロット反映
  ingSlot30.value = state.ingredients[1] || "A";
  ingSlot60.value = state.ingredients[2] || "A";
  updateIngredientBadges();

  natureSelect.value = state.natureName || "";
  shinyCheck.checked = state.isShiny;
  flCheck.checked = state.isFlUnder10;
  streamCheck.checked = state.isStreamBonus;

  subSkillContainer.querySelectorAll(".skill-select").forEach(sel => {
    const slot = parseInt(sel.dataset.slot, 10);
    sel.value = state.subSkills[slot] || "";
  });
}

/**
 * スコア計算と結果カードの更新
 */
function recalculateAndRender() {
  const result = calculateTotalScore(state);

  scoreValEl.textContent = result.totalScore;
  updateLamps(result.totalScore);

  const shinyText = state.isShiny ? "★ " : "";
  cardPokemonNameEl.textContent = `${shinyText}${state.pokemonName}`;
  cardSpEl.textContent = state.sp > 0 ? `SP ${state.sp}` : "SP --";

  if (result.details.length === 0) {
    breakdownGridEl.innerHTML = `
      <div class="breakdown-item" style="grid-column: 1 / -1; text-align: center; color: var(--text-sub);">
        スクショをアップロードするか、下のフォームでステータスを選択してください
      </div>
    `;
  } else {
    breakdownGridEl.innerHTML = result.details.map(d => {
      const sign = d.score > 0 ? `+${d.score}` : d.score;
      const scoreClass = d.score > 0 ? "plus" : (d.score < 0 ? "minus" : "");
      return `
        <div class="breakdown-item">
          <span class="breakdown-cat">${d.category}</span>
          <span class="breakdown-name" title="${d.name}">${d.name}</span>
          <div class="breakdown-score ${scoreClass}">${sign}</div>
        </div>
      `;
    }).join('');
  }

  const bonuses = [];
  if (state.isShiny) bonuses.push({ name: "色違い (+350)", gold: true });
  if (state.catchType === "dekanuchan") bonuses.push({ name: "デカヌチャン直取り (+150)", gold: false });
  if (state.catchType === "nakanuchan") bonuses.push({ name: "ナカヌチャン直取り (+50)", gold: false });
  if (state.isFlUnder10) bonuses.push({ name: "FL10以内 (+100)", gold: false });
  if (state.isStreamBonus) bonuses.push({ name: "リサ配ボーナス (+70)", gold: false });

  bonusTagsEl.innerHTML = bonuses.map(b => `
    <span class="bonus-tag ${b.gold ? 'gold' : ''}">${b.name}</span>
  `).join('');
}

/**
 * 履歴の保存・読み込み
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToHistory() {
  const result = calculateTotalScore(state);
  const history = loadHistory();
  const item = {
    id: Date.now(),
    pokemonName: state.pokemonName,
    isShiny: state.isShiny,
    sp: state.sp,
    score: result.totalScore,
    date: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  };

  history.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 30)));
  renderHistory();
}

function deleteHistory(id) {
  const history = loadHistory().filter(item => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    historyListEl.innerHTML = `<p style="font-size:0.75rem; color:var(--text-sub); text-align:center; padding:10px;">記録はまだありません</p>`;
    return;
  }

  historyListEl.innerHTML = history.map(item => {
    const shiny = item.isShiny ? '★ ' : '';
    return `
      <div class="history-item">
        <div>
          <div class="history-name">${shiny}${item.pokemonName} (SP ${item.sp})</div>
          <div class="history-meta">${item.date}</div>
        </div>
        <div style="display:flex; align-items:center;">
          <div class="history-score">${item.score} <span style="font-size:0.75rem;">点</span></div>
          <button class="history-del" data-id="${item.id}" title="削除">×</button>
        </div>
      </div>
    `;
  }).join('');

  historyListEl.querySelectorAll(".history-del").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      deleteHistory(id);
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
