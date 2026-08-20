/**
 * The Ultimate Unako Championship - X投稿用の書き出し
 *
 * ・投稿文をクリップボードへコピー
 * ・結果カードを Canvas で描き起こして PNG 保存
 *
 * DOMのカードを画像化するライブラリ（html2canvas 等）は使わない。
 * 静的サイトに外部依存を増やしたくないのと、投稿向けには
 * 画面表示とは別に余白や文字サイズを詰めた方が読みやすいため、
 * 同じ内容を Canvas に描き直している。
 */
import { SUB_SKILLS, INGREDIENTS, INGREDIENT_SCORES, NATURES, NATURE_SCORES } from './scoring.js?v=15';

export const HASHTAG = '#最強うなこ決定戦';

const FONT = '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
const SLOT_LEVELS = [10, 25, 50, 70, 80];

// ---------------------------------------------------------------- 投稿文

/**
 * Xに貼る文面を組み立てる。
 * 日本語は1文字2カウントで上限280なので、サブスキルは略称を使って
 * 140文字以内に収める。
 */
export function buildPostText(state, result) {
  const lines = [HASHTAG];

  const sp = state.sp > 0 ? ` SP${state.sp}` : '';
  lines.push(`${state.pokemonName}${sp} → ${result.totalScore}pt`);

  const ing = INGREDIENT_SCORES[state.ingredientPattern];
  const ingShort = state.ingredients.map(c => INGREDIENTS[c]?.short || '?').join('/');
  if (ing && state.ingredientPattern !== 'OTHER') {
    lines.push(`🍅${state.ingredientPattern}（${ingShort}）`);
  }

  const skills = state.subSkills
    .map((id, i) => {
      const s = SUB_SKILLS.find(x => x.id === id);
      return s ? `${s.short}` : null;
    })
    .filter(Boolean);
  if (skills.length) lines.push(skills.join(' / '));

  if (state.natureName) {
    const n = NATURES.find(x => x.name === state.natureName);
    const up = NATURE_SCORES.up[n?.up || 'none'].short;
    const down = NATURE_SCORES.down[n?.down || 'none'].short;
    lines.push(`せいかく ${state.natureName}（${up}↑↑/${down}↓↓）`);
  }

  const extras = [];
  if (state.isShiny) extras.push('★色違い');
  if (state.catchType === 'dekanuchan') extras.push('デカヌチャン直取り');
  if (state.catchType === 'nakanuchan') extras.push('ナカヌチャン直取り');
  if (state.isFlUnder10) extras.push('FL10以内');
  if (state.isStreamBonus) extras.push('リサ配');
  if (extras.length) lines.push(extras.join(' / '));

  return lines.join('\n');
}

/** クリップボードにコピー。使えない環境では textarea を選択状態にして手動コピーへ回す */
export async function copyPostText(text, fallbackEl) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('クリップボードへの書き込みに失敗', e);
  }
  if (fallbackEl) {
    fallbackEl.hidden = false;
    fallbackEl.value = text;
    fallbackEl.focus();
    fallbackEl.select();
  }
  return false;
}

// ---------------------------------------------------------------- 画像

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 幅に収まるように1文字ずつ折り返す（日本語なので単語境界は見ない） */
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 結果カードを描いた canvas を返す
 */
export async function buildScoreCanvas(state, result) {
  const W = 1080;
  const PAD = 44;
  const GAP = 14;
  const COL_W = (W - PAD * 2 - GAP) / 2;

  // 先に各項目の高さを測る（項目名が折り返すぶん高さが変わる）
  const probe = document.createElement('canvas').getContext('2d');
  const items = result.details.map(d => {
    probe.font = `bold 27px ${FONT}`;
    const nameLines = wrapText(probe, d.name, COL_W - 32);
    // 30(カテゴリ) + 名前の行 + 46(点数の行)。点数が名前と重ならないだけの余白をとる
    return { ...d, nameLines, h: 30 + nameLines.length * 34 + 46 };
  });

  // 2列に流し込み、行ごとの高さを揃える
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = [items[i], items[i + 1]].filter(Boolean);
    rows.push({ pair, h: Math.max(...pair.map(p => p.h)) });
  }

  const tags = [];
  if (state.isShiny) tags.push({ text: '★ 色違い (+350)', gold: true });
  if (state.catchType === 'dekanuchan') tags.push({ text: 'デカヌチャン直取り (+150)' });
  if (state.catchType === 'nakanuchan') tags.push({ text: 'ナカヌチャン直取り (+50)' });
  if (state.isFlUnder10) tags.push({ text: 'FL10以内 (+100)' });
  if (state.isStreamBonus) tags.push({ text: 'リサ配ボーナス (+70)' });

  // タグは幅が尽きたら次の行へ送る（打ち切ると付いているボーナスが消えてしまう）
  probe.font = `bold 23px ${FONT}`;
  const tagRows = [];
  let cur = [];
  let curW = 0;
  for (const tag of tags) {
    const w = probe.measureText(tag.text).width + 26;
    if (cur.length && curW + w > W - PAD * 2) { tagRows.push(cur); cur = []; curW = 0; }
    cur.push({ ...tag, w });
    curW += w + 10;
  }
  if (cur.length) tagRows.push(cur);

  const headerH = 190;
  const tagsH = tagRows.length ? tagRows.length * 52 + 6 : 0;
  const footerH = 84;
  const bodyH = rows.reduce((a, r) => a + r.h + GAP, 0);
  const H = headerH + tagsH + bodyH + footerH + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 背景と上部のグラデーション帯
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#f26d91');
  grad.addColorStop(0.5, '#ff9ebb');
  grad.addColorStop(1, '#a0aec0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 12);

  // ---- ヘッダー ----
  let x = PAD;
  const mascot = await loadImage('tabako.png');
  if (mascot) {
    const s = 92;
    ctx.fillStyle = '#ffeef3';
    roundRect(ctx, x, 52, s, s, 18);
    ctx.fill();
    // 縦横比を保ったまま枠に収める（引き伸ばすとマスコットが崩れる）
    const fit = Math.min((s - 12) / mascot.width, (s - 12) / mascot.height);
    const dw = mascot.width * fit;
    const dh = mascot.height * fit;
    ctx.drawImage(mascot, x + (s - dw) / 2, 52 + (s - dh) / 2, dw, dh);
    ctx.strokeStyle = '#ffc2d3';
    ctx.lineWidth = 3;
    roundRect(ctx, x, 52, s, s, 18);
    ctx.stroke();
    x += s + 20;
  }

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const nameText = (state.isShiny ? '★ ' : '') + state.pokemonName;
  ctx.font = `bold 30px ${FONT}`;
  const nameW = ctx.measureText(nameText).width + 30;
  ctx.fillStyle = '#ffeef3';
  roundRect(ctx, x, 54, nameW, 46, 12);
  ctx.fill();
  ctx.fillStyle = '#d8456f';
  ctx.fillText(nameText, x + 15, 78);

  const spText = state.sp > 0 ? `SP ${state.sp}` : 'SP --';
  ctx.font = `bold 28px ${FONT}`;
  const spW = ctx.measureText(spText).width + 30;
  ctx.fillStyle = '#f7f9fb';
  roundRect(ctx, x, 108, spW, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#2d3748';
  ctx.fillText(spText, x + 15, 130);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#718096';
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillText('TOTAL SCORE', W - PAD, 72);
  ctx.fillStyle = '#d8456f';
  ctx.font = `bold 82px ${FONT}`;
  const scoreText = String(result.totalScore);
  ctx.fillText(scoreText, W - PAD - 44, 124);
  ctx.font = `bold 32px ${FONT}`;
  ctx.fillText('pt', W - PAD, 140);

  // 区切り線
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(PAD, headerH - 22);
  ctx.lineTo(W - PAD, headerH - 22);
  ctx.stroke();
  ctx.setLineDash([]);

  // ---- ボーナスタグ ----
  let y = headerH;
  if (tagRows.length) {
    ctx.textAlign = 'left';
    ctx.font = `bold 23px ${FONT}`;
    tagRows.forEach((row, ri) => {
      let tx = PAD;
      const ty = y + ri * 52;
      for (const tag of row) {
        ctx.fillStyle = tag.gold ? '#fff9e6' : '#fff0f5';
        roundRect(ctx, tx, ty, tag.w, 42, 8);
        ctx.fill();
        ctx.strokeStyle = tag.gold ? '#ffe082' : '#f8bbd0';
        ctx.lineWidth = 2;
        roundRect(ctx, tx, ty, tag.w, 42, 8);
        ctx.stroke();
        ctx.fillStyle = tag.gold ? '#b78103' : '#c2185b';
        ctx.fillText(tag.text, tx + 13, ty + 22);
        tx += tag.w + 10;
      }
    });
    y += tagsH;
  }

  // ---- 内訳 ----
  for (const row of rows) {
    row.pair.forEach((item, i) => {
      const bx = PAD + i * (COL_W + GAP);
      ctx.fillStyle = '#fafbfc';
      roundRect(ctx, bx, y, COL_W, row.h, 12);
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      roundRect(ctx, bx, y, COL_W, row.h, 12);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#718096';
      ctx.font = `21px ${FONT}`;
      ctx.fillText(item.category, bx + 16, y + 22);

      ctx.fillStyle = '#2d3748';
      ctx.font = `bold 27px ${FONT}`;
      item.nameLines.forEach((line, li) => {
        ctx.fillText(line, bx + 16, y + 54 + li * 34);
      });

      ctx.textAlign = 'right';
      ctx.fillStyle = item.score > 0 ? '#2f855a' : item.score < 0 ? '#c53030' : '#a0aec0';
      ctx.font = `bold 27px ${FONT}`;
      ctx.fillText(item.score > 0 ? `+${item.score}` : String(item.score), bx + COL_W - 16, y + row.h - 20);
    });
    y += row.h + GAP;
  }

  // ---- フッター ----
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 10);
  ctx.lineTo(W - PAD, y + 10);
  ctx.stroke();

  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = '#a0aec0';
  ctx.textAlign = 'left';
  ctx.fillText('The Ultimate Unako Championship', PAD, y + 46);
  ctx.textAlign = 'right';
  ctx.fillText(HASHTAG, W - PAD, y + 46);

  return canvas;
}

/** 結果カードのPNGを保存させる */
export async function downloadScoreImage(state, result) {
  const canvas = await buildScoreCanvas(state, result);
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `unako_${state.pokemonName}_${result.totalScore}pt.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // click直後に破棄するとダウンロードが始まらない環境があるので少し待つ
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve(canvas);
    }, 'image/png');
  });
}
