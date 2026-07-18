/**
 * 界面渲染：根据 state 重绘所有牌堆与统计信息
 */

import { state } from '../core/state.js';
import { readCssVar } from '../utils/css.js';
import { canAutoComplete, isWon } from '../core/rules.js';
import { formatTime } from '../core/game.js';
import { createCardElement, createStockBackCard } from './card.js';
import { attachDrag } from './drag.js';
import { autoMoveCard } from './autoMove.js';
import { clearHint } from './hint.js';

/** 胜负检测回调（由 main 注入） */
let onWinCheck = () => {};

/**
 * @param {Function} callback
 */
export function setWinCheckCallback(callback) {
  onWinCheck = callback;
}

/** 更新工具栏统计数字 */
export function updateStats() {
  document.getElementById('s-moves').textContent = state.moves;
  document.getElementById('s-score').textContent = state.score;
  document.getElementById('s-time').textContent = formatTime();

  const redealEl = document.getElementById('s-redeal');
  if (state.maxRedeals < 0) {
    redealEl.textContent = '∞';
    redealEl.style.color = '#ffe082';
  } else {
    const remaining = state.maxRedeals - state.redealsUsed;
    redealEl.textContent = remaining > 0 ? remaining : '无';
    redealEl.style.color = remaining <= 1 ? '#ef5350' : '#ffe082';
  }
}

/** 更新自动完成按钮可见性 */
function updateAutoButton() {
  document.getElementById('auto-btn').style.display =
    canAutoComplete() ? 'block' : 'none';
}

/** 完整重绘棋盘 */
export function render() {
  clearHint();
  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau();
  updateStats();
  updateAutoButton();
  onWinCheck();
}

/** 渲染牌库 */
function renderStock() {
  const pile = document.getElementById('stock-pile');
  pile.querySelectorAll('.card, #diff-badge').forEach((el) => el.remove());

  if (state.stock.length) {
    pile.appendChild(createStockBackCard());

    const badge = document.createElement('div');
    badge.id = 'diff-badge';
    badge.textContent = state.stock.length + '张';
    pile.appendChild(badge);
  } else if (
    state.maxRedeals >= 0 &&
    state.redealsUsed >= state.maxRedeals &&
    state.waste.length
  ) {
    const badge = document.createElement('div');
    badge.id = 'diff-badge';
    badge.style.color = '#ef5350';
    badge.textContent = '无重发';
    pile.appendChild(badge);
  }
}

/** 渲染废牌区（扇形展示最近 drawCount 张） */
function renderWaste() {
  const pile = document.getElementById('waste-pile');
  pile.querySelectorAll('.card').forEach((el) => el.remove());

  if (!state.waste.length) return;

  const showCount = Math.min(state.drawCount, state.waste.length);
  const fan = readCssVar('--waste-fan');

  for (let i = 0; i < showCount; i++) {
    const card = state.waste[state.waste.length - showCount + i];
    const el = createCardElement(card);
    el.style.top = '0';
    el.style.left = i * fan + 'px';
    el.style.zIndex = i + 1;

    if (i === showCount - 1) {
      // 仅最上层可拖
      const wasteIndex = state.waste.length - 1;
      attachDrag(
        el, card, 'w', 0, wasteIndex,
        () => autoMoveCard('w', 0, wasteIndex, render),
        render
      );
    } else {
      el.style.pointerEvents = 'none';
    }

    pile.appendChild(el);
  }
}

/** 渲染四个基础区（只显示顶张，可拖回合法桌面列） */
function renderFoundations() {
  document.querySelectorAll('.fnd-col').forEach((col, fi) => {
    col.querySelectorAll('.card').forEach((el) => el.remove());

    if (state.foundations[fi].length) {
      const cardIndex = state.foundations[fi].length - 1;
      const card = state.foundations[fi][cardIndex];
      const el = createCardElement(card);
      el.style.top = '0';
      attachDrag(
        el, card, 'f', fi, cardIndex,
        () => autoMoveCard('f', fi, cardIndex, render),
        render
      );
      col.appendChild(el);
    }
  });
}

/** 渲染七列桌面 */
function renderTableau() {
  const gapUp = readCssVar('--tab-up');
  const gapDown = readCssVar('--tab-down');

  document.querySelectorAll('.tab-col').forEach((col, ti) => {
    col.querySelectorAll('.card').forEach((el) => el.remove());

    let top = 0;
    state.tableau[ti].forEach((card, ci) => {
      const el = createCardElement(card);
      el.style.top = top + 'px';
      el.style.zIndex = ci + 1;

      if (card.faceUp) {
        attachDrag(
          el, card, 't', ti, ci,
          () => autoMoveCard('t', ti, ci, render),
          render
        );
      }

      col.appendChild(el);
      top += card.faceUp ? gapUp : gapDown;
    });
  });
}

/**
 * 检查是否通关（供 render 末尾调用）
 * @returns {boolean}
 */
export function checkWinCondition() {
  return isWon();
}
