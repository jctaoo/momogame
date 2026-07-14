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

  // 过滤：整列正面牌平移到空桌面列（不翻新牌，无实质进展）
  return moves.filter((move) => !isTrivialEmptyColumnMove(move));
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
 * 在源与目标之间绘制虚线箭头
 * @param {HTMLElement} sourceEl
 * @param {HTMLElement} targetEl
 */
function drawHintArrow(sourceEl, targetEl) {
  const svg = document.getElementById('hint-arrow');
  const sr = sourceEl.getBoundingClientRect();
  const tr = targetEl.getBoundingClientRect();

  const x1 = sr.left + sr.width / 2;
  const y1 = sr.top + sr.height / 2;
  const x2 = tr.left + tr.width / 2;
  const y2 = tr.top + tr.height / 2;
  const midX = (x1 + x2) / 2;
  const midY = Math.min(y1, y2) - 30;

  svg.innerHTML = `
    <defs>
      <marker id="ah" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#4fc3f7"/>
      </marker>
    </defs>
    <path d="M${x1},${y1} Q${midX},${midY} ${x2},${y2}"
      stroke="#4fc3f7" stroke-width="2.5" fill="none" stroke-dasharray="6,4"
      marker-end="url(#ah)" opacity="0.8">
      <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.8s" repeatCount="indefinite"/>
    </path>
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

/** 展示最优提示 */
export function showHint() {
  clearHint();

  const moves = findAllMoves();
  if (!moves.length) {
    play('droplet');
    return;
  }

  play('chime');

  // 评分选最优
  let best = null;
  let bestScore = -999;

  for (const move of moves) {
    let score = 0;
    if (move.toType === 'f') score += 50;
    if (move.toType === 't') {
      if (move.fromType === 'w') score += 15;
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

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  if (!best) return;

  const sourceEl = findSourceElement(best);
  if (!sourceEl) return;

  sourceEl.classList.add('hint-source');

  const targetEl =
    best.toType === 'f'
      ? document.querySelectorAll('.fnd-col')[best.toIndex]
      : document.querySelectorAll('.tab-col')[best.toIndex];

  if (targetEl) targetEl.classList.add('hint-target');
  drawHintArrow(sourceEl, targetEl);

  hintTimer = setTimeout(clearHint, 3000);
}
