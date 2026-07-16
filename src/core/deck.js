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

  // 用一个有限步、无渲染的贪心试玩补足静态评分：更偏好能真正翻开背牌的局。
  score += simulateOpening(layout, drawCount);

  return score;
}

/**
 * 对候选开局做轻量试玩。它不是求解器：只模拟有限步的优先着法，
 * 因此开局耗时始终受上限控制。
 * @param {{ tableau: import('./state.js').Card[][], stock: import('./state.js').Card[] }} layout
 * @param {number} drawCount
 * @returns {number}
 */
function simulateOpening(layout, drawCount) {
  const tableau = layout.tableau.map((pile) => pile.map((card) => ({ ...card })));
  const stock = layout.stock.map((card) => ({ ...card }));
  const waste = [];
  const foundations = Array.from({ length: 4 }, () => []);
  let exposed = 0;
  let tableauMoves = 0;
  let recycled = false;

  const canFoundation = (card, index) => {
    const pile = foundations[index];
    if (!pile.length) return card.rank === 'A' && SUITS[index] === card.suit;
    const top = pile[pile.length - 1];
    return card.suit === top.suit && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] + 1;
  };
  const canTableau = (card, index) => {
    const pile = tableau[index];
    if (!pile.length) return card.rank === 'K';
    const top = pile[pile.length - 1];
    return top.faceUp && card.color !== top.color && RANK_VALUE[card.rank] === RANK_VALUE[top.rank] - 1;
  };
  const reveal = (index) => {
    const pile = tableau[index];
    const top = pile[pile.length - 1];
    if (top && !top.faceUp) {
      top.faceUp = true;
      exposed++;
      return true;
    }
    return false;
  };
  const validStackFrom = (pile, start) => {
    if (!pile[start]?.faceUp) return false;
    for (let i = start; i < pile.length - 1; i++) {
      if (!pile[i + 1].faceUp || pile[i].color === pile[i + 1].color ||
        RANK_VALUE[pile[i].rank] !== RANK_VALUE[pile[i + 1].rank] + 1) return false;
    }
    return true;
  };

  // 36 步 × 最多 96 个候选局；只操作小数组，避免开局出现可感知卡顿。
  for (let step = 0; step < 36; step++) {
    let moved = false;

    // 优先收可直接上基础区的牌。
    const sources = [];
    tableau.forEach((pile, index) => {
      if (pile.length && pile[pile.length - 1].faceUp) sources.push({ pile, index, type: 't' });
    });
    if (waste.length) sources.push({ pile: waste, index: -1, type: 'w' });
    for (const source of sources) {
      const card = source.pile[source.pile.length - 1];
      const foundationIndex = foundations.findIndex((_, i) => canFoundation(card, i));
      if (foundationIndex < 0) continue;
      foundations[foundationIndex].push(source.pile.pop());
      if (source.type === 't') reveal(source.index);
      moved = true;
      break;
    }
    if (moved) continue;

    // 其次优先能翻出背牌的桌面移动。
    for (let from = 0; from < tableau.length && !moved; from++) {
      const pile = tableau[from];
      for (let start = 0; start < pile.length && !moved; start++) {
        if (!validStackFrom(pile, start)) continue;
        for (let to = 0; to < tableau.length; to++) {
          if (to === from || !canTableau(pile[start], to)) continue;
          tableau[to].push(...pile.splice(start));
          reveal(from);
          tableauMoves++;
          moved = true;
          break;
        }
      }
    }
    if (moved) continue;

    // 最后尝试把废牌放回桌面；不行才继续翻牌。
    if (waste.length) {
      const card = waste[waste.length - 1];
      const to = tableau.findIndex((_, index) => canTableau(card, index));
      if (to >= 0) {
        tableau[to].push(waste.pop());
        tableauMoves++;
        continue;
      }
    }
    if (stock.length) {
      for (let i = 0; i < Math.min(drawCount, stock.length); i++) {
        const card = stock.pop();
        card.faceUp = true;
        waste.push(card);
      }
      continue;
    }
    if (waste.length && !recycled) {
      while (waste.length) {
        const card = waste.pop();
        card.faceUp = false;
        stock.push(card);
      }
      recycled = true;
      continue;
    }
    break;
  }

  return exposed * 18 + foundations.reduce((sum, pile) => sum + pile.length, 0) * 4 + tableauMoves * 2;
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
