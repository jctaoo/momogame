/**
 * 牌组：创建、洗牌、发牌与开局评分
 */

import { SUITS, SUIT_COLOR, RANKS, RANK_VALUE, TABLEAU_COUNT, DIFFICULTY } from '../constants.js';
import { state } from './state.js';

/**
 * 生成一副完整的 52 张牌
 * @returns {import('./state.js').Card[]}
 */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        color: SUIT_COLOR[suit],
        faceUp: false,
        id: rank + suit,
      });
    }
  }
  return deck;
}

/**
 * Fisher-Yates 洗牌（原地打乱）
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * 按 Klondike 规则发牌：桌面 1～7 列递增，最底张翻开，剩余入牌库
 * @param {import('./state.js').Card[]} deck
 * @returns {{ tableau: import('./state.js').Card[][], stock: import('./state.js').Card[] }}
 */
export function dealLayout(deck) {
  const tableau = Array.from({ length: TABLEAU_COUNT }, () => []);
  const stock = [];
  let index = 0;

  for (let col = 0; col < TABLEAU_COUNT; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck[index++];
      card.faceUp = row === col;
      tableau[col].push(card);
    }
  }

  while (index < deck.length) {
    deck[index].faceUp = false;
    stock.push(deck[index++]);
  }

  return { tableau, stock };
}

/**
 * 评估开局质量：鼓励可见可连牌、低点早出，惩罚埋藏的 A
 * 分数越高表示开局越好打
 * @param {{ tableau: import('./state.js').Card[][], stock: import('./state.js').Card[] }} layout
 * @param {number} drawCount
 * @returns {number}
 */
export function scoreDeal(layout, drawCount) {
  const tops = layout.tableau.map((pile) => pile[pile.length - 1]);
  // 少量随机扰动，避免同分时总是同一布局
  let score = Math.random() * 2;

  // 奖励七张明牌之间的可连接关系
  for (let i = 0; i < tops.length; i++) {
    for (let j = 0; j < tops.length; j++) {
      if (
        i !== j &&
        tops[i].color !== tops[j].color &&
        RANK_VALUE[tops[i].rank] === RANK_VALUE[tops[j].rank] - 1
      ) {
        score += 9;
      }
    }
  }

  // 低点牌（A/2/3）尽早出现有利于开基础区
  tops.forEach((card) => {
    if (RANK_VALUE[card.rank] <= 3) {
      score += (4 - RANK_VALUE[card.rank]) * 9;
    }
  });

  // 牌库前几轮能翻到的低点也加分
  const drawOrder = [...layout.stock].reverse();
  drawOrder.slice(0, drawCount * 3).forEach((card, i) => {
    if (RANK_VALUE[card.rank] <= 3) {
      score += (4 - RANK_VALUE[card.rank]) * 5 - i * 0.15;
    }
  });

  // 惩罚埋在背面下的 A
  layout.tableau.forEach((pile) => {
    pile.forEach((card, i) => {
      if (card.rank === 'A' && !card.faceUp) {
        score -= (pile.length - 1 - i) * 5;
      }
    });
  });

  return score;
}

/**
 * 根据当前难度多次尝试发牌，选取评分最高的布局写入 state
 */
export function dealBestLayout() {
  const config = DIFFICULTY[state.difficulty] || DIFFICULTY.normal;
  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < config.dealAttempts; i++) {
    const candidate = dealLayout(shuffle(createDeck()));
    const score = scoreDeal(candidate, config.drawCount);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  state.stock = best.stock;
  state.tableau = best.tableau;
  state.waste = [];
  state.foundations = Array.from({ length: 4 }, () => []);
}
