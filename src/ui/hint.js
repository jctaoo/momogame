/**
 * 提示系统：枚举合法着法、评分选优、高亮与箭头
 */

import { play } from 'cuelume';
import { RANK_VALUE } from '../constants.js';
import { state } from '../core/state.js';
import { canMoveToFoundation, canMoveToTableau } from '../core/rules.js';

/** 提示自动清除计时器 */
let hintTimer = null;

/** 清除所有提示高亮与箭头 */
export function clearHint() {
  document.querySelectorAll('.hint-source, .hint-target').forEach((el) => {
    el.classList.remove('hint-source', 'hint-target');
  });

  const arrow = document.getElementById('hint-arrow');
  if (arrow) arrow.innerHTML = '';

  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
}

/**
 * 枚举当前所有合法移动
 * @returns {Array<{
 *   card: import('../core/state.js').Card,
 *   fromType: string,
 *   sourceIndex: number,
 *   cardIndex: number,
 *   toType: string,
 *   toIndex: number,
 *   cards: import('../core/state.js').Card[]
 * }>}
 */
export function findAllMoves() {
  const moves = [];

  // 废牌顶张
  if (state.waste.length) {
    const card = state.waste[state.waste.length - 1];
    for (let fi = 0; fi < 4; fi++) {
      if (canMoveToFoundation(card, fi)) {
        moves.push({
          card, fromType: 'w', sourceIndex: 0, cardIndex: state.waste.length - 1,
          toType: 'f', toIndex: fi, cards: [card],
        });
      }
    }
    for (let ti = 0; ti < 7; ti++) {
      if (canMoveToTableau(card, ti)) {
        moves.push({
          card, fromType: 'w', sourceIndex: 0, cardIndex: state.waste.length - 1,
          toType: 't', toIndex: ti, cards: [card],
        });
      }
    }
  }

  // 桌面各列
  for (let ti = 0; ti < 7; ti++) {
    const pile = state.tableau[ti];
    if (!pile.length) continue;

    // 仅顶张 → 基础区 / 其他列
    const topCard = pile[pile.length - 1];
    for (let fi = 0; fi < 4; fi++) {
      if (canMoveToFoundation(topCard, fi)) {
        moves.push({
          card: topCard, fromType: 't', sourceIndex: ti, cardIndex: pile.length - 1,
          toType: 'f', toIndex: fi, cards: [topCard],
        });
      }
    }
    for (let tj = 0; tj < 7; tj++) {
      if (tj === ti) continue;
      if (canMoveToTableau(topCard, tj)) {
        moves.push({
          card: topCard, fromType: 't', sourceIndex: ti, cardIndex: pile.length - 1,
          toType: 't', toIndex: tj, cards: [topCard],
        });
      }
    }

    // 连续正面牌叠
    const firstFaceUp = pile.findIndex((c) => c.faceUp);
    for (let ci = firstFaceUp; ci < pile.length - 1; ci++) {
      const card = pile[ci];
      let valid = true;
      for (let k = ci; k < pile.length - 1; k++) {
        if (
          pile[k + 1].color === pile[k].color ||
          RANK_VALUE[pile[k + 1].rank] !== RANK_VALUE[pile[k].rank] - 1
        ) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;

      const stack = pile.slice(ci);
      for (let tj = 0; tj < 7; tj++) {
        if (tj === ti) continue;
        if (canMoveToTableau(card, tj)) {
          moves.push({
            card, fromType: 't', sourceIndex: ti, cardIndex: ci,
            toType: 't', toIndex: tj, cards: stack,
          });
        }
      }
    }
  }

  // 基础区顶张 → 合法桌面列
  for (let fi = 0; fi < 4; fi++) {
    const pile = state.foundations[fi];
    if (!pile.length) continue;
    const card = pile[pile.length - 1];
    for (let ti = 0; ti < 7; ti++) {
      if (canMoveToTableau(card, ti)) {
        moves.push({
          card, fromType: 'f', sourceIndex: fi, cardIndex: pile.length - 1,
          toType: 't', toIndex: ti, cards: [card],
        });
      }
    }
  }

  // 过滤无实质进展的桌面列平移（避免来回挪牌循环提示）
  return moves.filter(
    (move) => !isTrivialEmptyColumnMove(move) && !isPointlessTableauTransfer(move)
  );
}

/**
 * 是否为无意义的整堆搬空：源列全部已翻开，整列搬到空列
 * @param {ReturnType<typeof findAllMoves>[0]} move
 * @returns {boolean}
 */
function isTrivialEmptyColumnMove(move) {
  if (move.fromType !== 't' || move.toType !== 't') return false;
  if (state.tableau[move.toIndex].length !== 0) return false;

  const pile = state.tableau[move.sourceIndex];
  const firstFaceUp = pile.findIndex((c) => c.faceUp);
  // 从第一张正面牌起整段搬走，且下方没有背面牌可翻 → 纯换列
  return move.cardIndex === firstFaceUp && firstFaceUp === 0;
}

/**
 * 桌面列→桌面列且不翻开底牌的平移：可来回挪，提示无意义
 * （如 J 已在 Q 上，再挪到另一列 Q 下）
 * @param {ReturnType<typeof findAllMoves>[0]} move
 * @returns {boolean}
 */
function isPointlessTableauTransfer(move) {
  if (move.fromType !== 't' || move.toType !== 't') return false;

  const pile = state.tableau[move.sourceIndex];
  // 能翻开背面牌 → 有进展，保留
  if (move.cardIndex > 0 && !pile[move.cardIndex - 1].faceUp) return false;
  // 整列搬走（腾出空列）可能有用，保留
  if (move.cardIndex === 0) return false;

  // 下方已是正面牌：纯换列，过滤
  return true;
}

/**
 * 在源与目标之间绘制虚线箭头
 * @param {HTMLElement} sourceEl
 * @param {HTMLElement} targetEl
 */
/**
 * 二次贝塞尔终点切线角（弧度）
 * @param {number} x1
 * @param {number} y1
 * @param {number} cx
 * @param {number} cy
 * @param {number} x2
 * @param {number} y2
 */
function quadEndAngle(x1, y1, cx, cy, x2, y2) {
  // B'(1) ∝ (end - control)
  const dx = x2 - cx;
  const dy = y2 - cy;
  if (dx === 0 && dy === 0) return Math.atan2(y2 - y1, x2 - x1);
  return Math.atan2(dy, dx);
}

/**
 * 在终点绘制动漫风箭头头（多边形，不依赖 SVG marker）
 * @param {number} x
 * @param {number} y
 * @param {number} angle
 * @param {number} len
 * @param {number} halfW
 */
function arrowHeadPoints(x, y, angle, len, halfW) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // 尖端略超出终点
  const tipX = x + cos * 2;
  const tipY = y + sin * 2;
  const baseX = tipX - cos * len;
  const baseY = tipY - sin * len;
  const ox = -sin * halfW;
  const oy = cos * halfW;
  const notchX = tipX - cos * (len * 0.55);
  const notchY = tipY - sin * (len * 0.55);
  return [
    [tipX, tipY],
    [baseX + ox, baseY + oy],
    [notchX, notchY],
    [baseX - ox, baseY - oy],
  ]
    .map(([ax, ay]) => `${ax},${ay}`)
    .join(' ');
}

/**
 * 生成单条提示箭头的 SVG 片段
 * @param {HTMLElement} sourceEl
 * @param {HTMLElement} targetEl
 * @param {number} index - 用于错开重叠弧线
 * @returns {string}
 */
function buildArrowSvg(sourceEl, targetEl, index) {
  const sr = sourceEl.getBoundingClientRect();
  const tr = targetEl.getBoundingClientRect();

  const x1 = sr.left + sr.width / 2;
  const y1 = sr.top + sr.height / 2;
  const x2 = tr.left + tr.width / 2;
  const y2 = tr.top + tr.height / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(90, Math.max(40, dist * 0.28)) + (index % 4) * 14;
  const side = (index % 2 === 0 ? 1 : -1) * Math.floor(index / 2) * 22;
  const midX = (x1 + x2) / 2 + side;
  const midY = Math.min(y1, y2) - lift;
  // 线在箭头根部收住，避免虚线盖住箭头头
  const angle = quadEndAngle(x1, y1, midX, midY, x2, y2);
  const headLen = 16;
  const lineEndX = x2 - Math.cos(angle) * (headLen * 0.55);
  const lineEndY = y2 - Math.sin(angle) * (headLen * 0.55);
  const d = `M${x1},${y1} Q${midX},${midY} ${lineEndX},${lineEndY}`;

  const outerPts = arrowHeadPoints(x2, y2, angle, headLen, 8);
  const midPts = arrowHeadPoints(x2, y2, angle, headLen * 0.82, 5.5);
  const corePts = arrowHeadPoints(x2, y2, angle, headLen * 0.55, 2.6);

  return `
    <g class="hint-arrow-group">
      <path class="hint-path hint-path-outer" d="${d}"/>
      <path class="hint-path hint-path-mid" d="${d}" filter="url(#hint-glow)"/>
      <path class="hint-path hint-path-core" d="${d}"/>
      <polygon class="hint-head hint-head-outer" points="${outerPts}"/>
      <polygon class="hint-head hint-head-mid" points="${midPts}" filter="url(#hint-glow)"/>
      <polygon class="hint-head hint-head-core" points="${corePts}"/>
    </g>
  `;
}

/**
 * 同时绘制多条提示箭头
 * @param {Array<{ sourceEl: HTMLElement, targetEl: HTMLElement }>} pairs
 */
function drawHintArrows(pairs) {
  const svg = document.getElementById('hint-arrow');
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));

  const bodies = pairs
    .map((p, i) => buildArrowSvg(p.sourceEl, p.targetEl, i))
    .join('');

  svg.innerHTML = `
    <defs>
      <filter id="hint-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.6" result="b"/>
        <feMerge>
          <feMergeNode in="b"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    ${bodies}
  `;
}

/**
 * 定位提示用的源牌 DOM
 * @param {ReturnType<typeof findAllMoves>[0]} move
 * @returns {HTMLElement|null}
 */
function findSourceElement(move) {
  let sourceEl = null;

  document.querySelectorAll('.card').forEach((el) => {
    if (
      el.dataset.id !== move.card.id ||
      !el.classList.contains('face-up') ||
      el.classList.contains('dragging')
    ) {
      return;
    }

    if (move.fromType === 'w') {
      if (document.getElementById('waste-pile').contains(el)) sourceEl = el;
    } else if (move.fromType === 't') {
      const col = document.querySelectorAll('.tab-col')[move.sourceIndex];
      if (col && col.contains(el)) {
        const faceUpCards = [...col.querySelectorAll('.card.face-up')];
        const pile = state.tableau[move.sourceIndex];
        const firstUp = pile.findIndex((c) => c.faceUp);
        const posInFaceUp = move.cardIndex - firstUp;
        if (faceUpCards[posInFaceUp] === el) sourceEl = el;
      }
    } else if (move.fromType === 'f') {
      const col = document.querySelectorAll('.fnd-col')[move.sourceIndex];
      if (col && col.contains(el)) sourceEl = el;
    }
  });

  return sourceEl;
}

/**
 * 提示着法评分（越高越优先绘制在上层）
 * @param {ReturnType<typeof findAllMoves>[0]} move
 * @returns {number}
 */
function scoreMove(move) {
  let score = 0;
  if (move.toType === 'f') score += 50;
  if (move.toType === 't') {
    if (move.fromType === 'w') score += 15;
    if (move.fromType === 'f') score += 2;
    if (
      move.fromType === 't' &&
      move.cardIndex > 0 &&
      !state.tableau[move.sourceIndex][move.cardIndex - 1].faceUp
    ) {
      score += 30;
    }
    if (state.tableau[move.toIndex].length === 0 && move.card.rank === 'K') {
      score += 5;
    }
  }
  if (move.cards.length === 1) score += 3;
  return score;
}

/** 展示全部合法提示（多箭头 + 多高亮） */
export function showHint() {
  clearHint();

  const moves = findAllMoves();
  if (!moves.length) {
    play('droplet');
    return;
  }

  play('chime');

  const ranked = [...moves].sort((a, b) => scoreMove(b) - scoreMove(a));
  /** @type {Array<{ sourceEl: HTMLElement, targetEl: HTMLElement }>} */
  const pairs = [];

  for (const move of ranked) {
    const sourceEl = findSourceElement(move);
    if (!sourceEl) continue;

    const targetEl =
      move.toType === 'f'
        ? document.querySelectorAll('.fnd-col')[move.toIndex]
        : document.querySelectorAll('.tab-col')[move.toIndex];
    if (!targetEl) continue;

    sourceEl.classList.add('hint-source');
    targetEl.classList.add('hint-target');
    pairs.push({ sourceEl, targetEl });
  }

  if (!pairs.length) {
    play('droplet');
    return;
  }

  drawHintArrows(pairs);
  hintTimer = setTimeout(clearHint, 4000);
}
