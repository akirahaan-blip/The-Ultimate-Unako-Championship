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
} from './scoring.js';
import { analyzeScreenshot } from './ocr.js';

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
  silverSeeds: [false, false, false, false, false],
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
        <label class="seed-check">
          <input type="checkbox" class="seed-input" data-slot="${i}"> 銀種
        </label>
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
      dekanuchan: "デカヌチャン"
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

  // 銀種変更
  subSkillContainer.querySelectorAll(".seed-input").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const slot = parseInt(e.target.dataset.slot, 10);
      state.silverSeeds[slot] = e.target.checked;
      recalculateAndRender();
    });
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
    silverSeeds: [false, false, false, false, false],
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
          if (detected.ingredients) {
            state.ingredients = detected.ingredients;
            state.ingredientPattern = detected.ingredientPattern || getIngredientPattern(state.ingredients[0], state.ingredients[1], state.ingredients[2]);
          }
          if (detected.subSkills) {
            state.subSkills = detected.subSkills;
          }

          updateUIFromState();
          recalculateAndRender();

          progressLabel.textContent = "✓ 自動読み取り完了！";
          setTimeout(() => {
            ocrProgress.style.display = "none";
          }, 1800);
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

/**
 * 状態をUIフォームへ反映
 */
function updateUIFromState() {
  pokemonSelect.value = state.catchType;
  spInput.value = state.sp || "";
  
  // 食材スロット反映
  ingSlot30.value = state.ingredients[1] || "A";
  ingSlot60.value = state.ingredients[2] || "A";

  natureSelect.value = state.natureName || "";
  shinyCheck.checked = state.isShiny;
  flCheck.checked = state.isFlUnder10;
  streamCheck.checked = state.isStreamBonus;

  subSkillContainer.querySelectorAll(".skill-select").forEach(sel => {
    const slot = parseInt(sel.dataset.slot, 10);
    sel.value = state.subSkills[slot] || "";
  });

  subSkillContainer.querySelectorAll(".seed-input").forEach(chk => {
    const slot = parseInt(chk.dataset.slot, 10);
    chk.checked = !!state.silverSeeds[slot];
  });
}

/**
 * スコア計算と結果カードの更新
 */
function recalculateAndRender() {
  const result = calculateTotalScore(state);

  scoreValEl.textContent = result.totalScore;

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
