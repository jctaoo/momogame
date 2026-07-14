/**
 * Klondike 规则判定
 */

import { SUITS, RANK_VALUE } from '../constants.js';
import { state } from './state.js';

/**
 * 单张牌能否放入指定基础区
 * 空列只收对应花色的 A，否则同花色升序 +1
 * @param {import('./state.js').Card} card
 * @param {number} foundationIndex
 * @returns {boolean}
 */
export function canMoveToFoundation(card, foundationIndex) {
  const pile = state.foundations[foundationIndex];

  if (!pile.length) {
    return card.rank === 'A' && SUITS[foundationIndex] === card.suit;
  }

  const top = pile[pile.length - 1];
  return card.suit === top.suit && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1;
}

/**
 * 牌（或牌叠顶张）能否放到指定桌面列
 * 空列只收 K，否则异色降序 -1
 * @param {import('./state.js').Card} card
 * @param {number} tableauIndex
 * @returns {boolean}
 */
export function canMoveToTableau(card, tableauIndex) {
  const pile = state.tableau[tableauIndex];

  if (!pile.length) return card.rank === 'K';

  const top = pile[pile.length - 1];
  if (!top.faceUp) return false;

  return card.color !== top.color && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] - 1;
}

/**
 * 检查是否已全部收齐到基础区
 * @returns {boolean}
 */
export function isWon() {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0) === 52;
}

/**
 * 是否满足自动完成条件：桌面全翻开且牌库已空
 * @returns {boolean}
 */
export function canAutoComplete() {
  const tableauReady = state.tableau.every((pile) => pile.every((card) => card.faceUp));
  const stockEmpty = !state.stock.length;
  const wasteReady = state.waste.every((card) => card.faceUp);
  return tableauReady && stockEmpty && wasteReady;
}
