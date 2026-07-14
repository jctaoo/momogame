/**
 * 卡牌飞行动画（双击自动移动等）
 */

import { readCssVar } from '../utils/css.js';

/** 是否有动画进行中，防止连点 */
let animating = false;

export function isAnimating() {
  return animating;
}

/**
 * 获取放置目标的屏幕坐标（新牌将落在的位置）
 * @param {string} toType - 'f' | 't'
 * @param {number} toIndex
 * @returns {{ left: number, top: number }}
 */
export function getDropScreenPos(toType, toIndex) {
  if (toType === 'f') {
    const col = document.querySelectorAll('.fnd-col')[toIndex];
    const r = col.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }

  const col = document.querySelectorAll('.tab-col')[toIndex];
  const cards = [...col.querySelectorAll('.card')].filter(
    (el) => !el.classList.contains('dragging') && !el.classList.contains('returning')
  );

  if (cards.length) {
    const last = cards[cards.length - 1];
    const r = last.getBoundingClientRect();
    return { left: r.left, top: r.top + readCssVar('--tab-up') };
  }

  const slot = col.querySelector('.slot') || col;
  const r = slot.getBoundingClientRect();
  return { left: r.left, top: r.top };
}

/**
 * 根据来源定位要飞的 DOM 元素
 * @param {import('../core/state.js').Card[]} cards
 * @param {string} fromType
 * @param {number} sourceIndex
 * @returns {HTMLElement[]}
 */
export function findSourceElements(cards, fromType, sourceIndex) {
  const ids = new Set(cards.map((c) => c.id));
  /** @type {HTMLElement[]} */
  const found = [];

  if (fromType === 'w') {
    const pile = document.getElementById('waste-pile');
    pile.querySelectorAll('.card').forEach((el) => {
      if (ids.has(el.dataset.id)) found.push(el);
    });
  } else if (fromType === 't') {
    const col = document.querySelectorAll('.tab-col')[sourceIndex];
    if (col) {
      col.querySelectorAll('.card').forEach((el) => {
        if (ids.has(el.dataset.id)) found.push(el);
      });
    }
  } else if (fromType === 'f') {
    const col = document.querySelectorAll('.fnd-col')[sourceIndex];
    if (col) {
      col.querySelectorAll('.card').forEach((el) => {
        if (ids.has(el.dataset.id)) found.push(el);
      });
    }
  }

  return found;
}

/**
 * 将源牌飞向目标位置
 * @param {HTMLElement[]} sourceEls - 源牌 DOM（按叠放顺序，底→顶）
 * @param {{ left: number, top: number }} targetPos - 第一张（叠底）落点
 * @param {number} [duration=280]
 * @returns {Promise<void>}
 */
export function flyCards(sourceEls, targetPos, duration = 280) {
  if (!sourceEls.length) return Promise.resolve();

  animating = true;
  const stackOffset = readCssVar('--drag-stack');

  const flights = sourceEls.map((el, i) => {
    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    clone.classList.add('card-flying');
    clone.classList.remove('hint-source', 'dragging', 'returning');
    clone.style.cssText = '';
    clone.style.position = 'fixed';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.zIndex = String(7000 + i);
    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    clone.style.transition = 'none';
    document.body.appendChild(clone);

    // 原牌透明，避免动画期间「双影」
    el.style.opacity = '0';

    return {
      clone,
      toLeft: targetPos.left,
      toTop: targetPos.top + i * stackOffset,
    };
  });

  // 强制 reflow 后再开 transition
  void document.body.offsetWidth;

  flights.forEach(({ clone, toLeft, toTop }) => {
    clone.style.transition =
      `left ${duration}ms cubic-bezier(.22,.8,.32,1),` +
      `top ${duration}ms cubic-bezier(.22,.8,.32,1),` +
      `box-shadow ${duration}ms ease`;
    clone.style.left = toLeft + 'px';
    clone.style.top = toTop + 'px';
    clone.style.boxShadow = '0 8px 20px rgba(0,0,0,.35)';
  });

  return new Promise((resolve) => {
    setTimeout(() => {
      flights.forEach(({ clone }) => clone.remove());
      animating = false;
      resolve();
    }, duration);
  });
}
