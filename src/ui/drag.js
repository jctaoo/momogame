/**
 * 拖拽交互：鼠标 / 触摸，支持牌叠整体拖动
 */

import { play } from 'cuelume';
import { state } from '../core/state.js';
import { readCssVar } from '../utils/css.js';
import { canMoveToFoundation, canMoveToTableau } from '../core/rules.js';
import { executeMove } from '../core/game.js';
import { getDropScreenPos } from './animate.js';
import { clearHint } from './hint.js';

/** 拖拽启动的像素阈值（避免误触） */
const DRAG_THRESHOLD_SQ = 16;

/** 松手落到目标 / 回弹动画时长（ms） */
const SNAP_DURATION = 220;

/**
 * 为可拖动卡牌绑定指针事件
 * @param {HTMLElement} element
 * @param {import('../core/state.js').Card} card
 * @param {string} sourceType - 'w' | 't' | 'f'
 * @param {number} sourceIndex
 * @param {number} cardIndex
 * @param {Function} onDoubleClick
 * @param {Function} onAfterMove - 移动完成后的渲染回调
 */
export function attachDrag(
  element,
  card,
  sourceType,
  sourceIndex,
  cardIndex,
  onDoubleClick,
  onAfterMove
) {
  element.ondblclick = () => {
    clearHint();
    onDoubleClick();
  };

  function beginPointer(clientX, clientY, event) {
    event.preventDefault();

    // 上一次落子动画尚未结束时忽略新拖拽，防止双重提交丢牌
    if (state.drag || state.dropCommitPending) return;

    const startX = clientX;
    const startY = clientY;
    let isDragging = false;
    let ended = false;

    // 桌面列：点中牌 + 其下方全部一起拖；其它来源仅单张
    let cards = [card];
    let elements = [element];

    if (sourceType === 't' && cardIndex !== undefined) {
      cards = state.tableau[sourceIndex].slice(cardIndex);
      const column = element.closest('.tab-col');
      elements = [];
      // 按列内顺序收集，保证叠序与数据一致
      column.querySelectorAll('.card').forEach((el) => {
        if (cards.some((c) => c.id === el.dataset.id)) elements.push(el);
      });
    }

    // 基础区只允许单张；桌面叠不能拆
    if (sourceType === 't' && cards.length === 0) return;

    const rect = element.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const stackOffset = readCssVar('--drag-stack');
    // 固定定位前记录原始位置，便于回弹
    const originRects = elements.map((el) => el.getBoundingClientRect());

    function startDrag() {
      isDragging = true;
      play('press');

      elements.forEach((el, i) => {
        const r = originRects[i];
        el.classList.add('dragging');
        el.style.position = 'fixed';
        el.style.left = r.left + 'px';
        el.style.top = r.top + 'px';
        el.style.zIndex = 5000 + i;
      });

      state.drag = {
        cards,
        elements,
        sourceType,
        sourceIndex,
        cardIndex,
        offsetX,
        offsetY,
        stackOffset,
      };
    }

    function onMove(x, y) {
      if (ended) return;
      if (!isDragging) {
        const dx = x - startX;
        const dy = y - startY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_SQ) return;
        startDrag();
      }

      elements.forEach((el, i) => {
        el.style.left = x - offsetX + 'px';
        el.style.top = y - offsetY + i * stackOffset + 'px';
      });
      highlightDropTargets(x, y);
    }

    function onEnd(x, y) {
      // touchend + mouseup 可能各触发一次，只处理首次
      if (ended) return;
      ended = true;

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);

      // 未真正拖动则保留元素，以便双击生效
      if (!isDragging) return;

      clearDropHighlight();
      const target = findDropTarget(x, y);

      if (target) {
        // 从松手位置过渡到最终落点，再提交状态
        const dropPos = getDropScreenPos(target.type, target.index);
        elements.forEach((el) => {
          el.classList.add('returning');
          el.classList.remove('dragging');
        });
        void document.body.offsetWidth;

        elements.forEach((el, i) => {
          el.style.left = dropPos.left + 'px';
          el.style.top = dropPos.top + i * stackOffset + 'px';
        });

        state.drag = null;
        state.dropCommitPending = true;
        setTimeout(() => {
          executeMove(
            cards,
            sourceType,
            sourceIndex,
            cardIndex,
            target.type,
            target.index
          );
          state.dropCommitPending = false;
          onAfterMove();
        }, SNAP_DURATION);
        return;
      }

      // 无效放置：回弹动画（无音效）
      elements.forEach((el) => el.classList.add('returning'));
      void document.body.offsetWidth; // 强制 reflow

      elements.forEach((el, i) => {
        el.classList.remove('dragging');
        el.style.left = originRects[i].left + 'px';
        el.style.top = originRects[i].top + 'px';
      });

      state.drag = null;
      setTimeout(() => onAfterMove(), SNAP_DURATION);
    }

    function onMouseMove(e) {
      onMove(e.clientX, e.clientY);
    }
    function onMouseUp(e) {
      onEnd(e.clientX, e.clientY);
    }
    function onTouchMove(e) {
      e.preventDefault();
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }
    function onTouchEnd(e) {
      const t = e.changedTouches[0];
      onEnd(t.clientX, t.clientY);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  element.addEventListener('mousedown', (e) => {
    if (e.button === 0) beginPointer(e.clientX, e.clientY, e);
  });
  element.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 1) {
        beginPointer(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    },
    { passive: false }
  );
}

/** 清除放置高亮 */
export function clearDropHighlight() {
  document.querySelectorAll('.drop-highlight').forEach((el) => {
    el.classList.remove('drop-highlight');
  });
}

/**
 * 计算桌面列的完整命中矩形
 * 卡牌为 absolute，列本身只有槽位高度，需并入所有子牌的包围盒
 * @param {HTMLElement} column
 * @returns {{ left: number, right: number, top: number, bottom: number }}
 */
function getTableauHitRect(column) {
  const base = column.getBoundingClientRect();
  let left = base.left;
  let right = base.right;
  let top = base.top;
  let bottom = base.bottom;

  column.querySelectorAll('.card').forEach((card) => {
    // 拖拽中的牌已 fixed，不计入目标列范围
    if (card.classList.contains('dragging') || card.classList.contains('returning')) return;
    const r = card.getBoundingClientRect();
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  });

  // 空列至少保留槽位高度，便于放入 K
  return { left, right, top, bottom };
}

/**
 * 点是否落在矩形内
 * @param {number} x
 * @param {number} y
 * @param {{ left: number, right: number, top: number, bottom: number }} rect
 */
function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * 根据指针位置高亮合法放置区
 * @param {number} mouseX
 * @param {number} mouseY
 */
function highlightDropTargets(mouseX, mouseY) {
  clearDropHighlight();
  if (!state.drag) return;

  const { cards, sourceType } = state.drag;

  if (cards.length === 1 && sourceType !== 'f') {
    document.querySelectorAll('.fnd-col').forEach((col, fi) => {
      const r = col.getBoundingClientRect();
      if (pointInRect(mouseX, mouseY, r) && canMoveToFoundation(cards[0], fi)) {
        col.classList.add('drop-highlight');
      }
    });
  }

  document.querySelectorAll('.tab-col').forEach((col, ti) => {
    const hit = getTableauHitRect(col);
    if (pointInRect(mouseX, mouseY, hit) && canMoveToTableau(cards[0], ti)) {
      col.classList.add('drop-highlight');
    }
  });
}

/**
 * 命中检测：返回放置目标
 * @param {number} mouseX
 * @param {number} mouseY
 * @returns {{ type: string, index: number }|null}
 */
function findDropTarget(mouseX, mouseY) {
  if (!state.drag) return null;

  const { cards, sourceType } = state.drag;

  if (cards.length === 1 && sourceType !== 'f') {
    const foundations = document.querySelectorAll('.fnd-col');
    for (let fi = 0; fi < 4; fi++) {
      const r = foundations[fi].getBoundingClientRect();
      if (pointInRect(mouseX, mouseY, r) && canMoveToFoundation(cards[0], fi)) {
        return { type: 'f', index: fi };
      }
    }
  }

  const columns = document.querySelectorAll('.tab-col');
  for (let ti = 0; ti < 7; ti++) {
    const hit = getTableauHitRect(columns[ti]);
    if (pointInRect(mouseX, mouseY, hit) && canMoveToTableau(cards[0], ti)) {
      return { type: 't', index: ti };
    }
  }

  return null;
}
