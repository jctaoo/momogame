/**
 * 对局状态持久化：刷新后恢复完整进度
 */

import {
  DECK_SIZE,
  DIFFICULTY,
  FOUNDATION_COUNT,
  GAME_STORAGE_KEY,
  SUIT_COLOR,
  TABLEAU_COUNT,
} from '../constants.js';
import { state } from './state.js';

const SAVE_VERSION = 1;

/** @param {import('./state.js').Card} card */
function cloneCard(card) {
  return {
    suit: card.suit,
    rank: card.rank,
    color: card.color || SUIT_COLOR[card.suit],
    faceUp: !!card.faceUp,
    id: card.id,
  };
}

/** @param {import('./state.js').Card[]} cards */
function cloneCards(cards) {
  return cards.map(cloneCard);
}

/** @param {unknown} card */
function isValidCard(card) {
  if (!card || typeof card !== 'object') return false;
  const c = /** @type {Record<string, unknown>} */ (card);
  return (
    typeof c.suit === 'string' &&
    typeof c.rank === 'string' &&
    typeof c.id === 'string' &&
    typeof c.faceUp === 'boolean'
  );
}

/**
 * 序列化可恢复的完整对局状态
 * @returns {object}
 */
export function serializeState() {
  return {
    version: SAVE_VERSION,
    stock: cloneCards(state.stock),
    waste: cloneCards(state.waste),
    foundations: state.foundations.map(cloneCards),
    tableau: state.tableau.map(cloneCards),
    moves: state.moves,
    score: state.score,
    elapsedSeconds: state.elapsedSeconds,
    timerStarted: state.timerStarted,
    difficulty: state.difficulty,
    drawCount: state.drawCount,
    maxRedeals: state.maxRedeals,
    redealsUsed: state.redealsUsed,
    history: state.history.map((entry) => {
      if (entry.type === 'draw') {
        return { type: 'draw', count: entry.count };
      }
      if (entry.type === 'recycle') {
        return {
          type: 'recycle',
          wasteSnapshot: cloneCards(entry.wasteSnapshot || []),
          redealsUsed: entry.redealsUsed,
        };
      }
      return {
        fromType: entry.fromType,
        fromIndex: entry.fromIndex,
        cardIndex: entry.cardIndex,
        toType: entry.toType,
        toIndex: entry.toIndex,
        cards: cloneCards(entry.cards || []),
        flippedColumn: entry.flippedColumn ?? null,
      };
    }),
  };
}

/**
 * 校验存档结构与牌面完整性
 * @param {unknown} data
 * @returns {boolean}
 */
export function isValidSave(data) {
  if (!data || typeof data !== 'object') return false;
  const d = /** @type {Record<string, unknown>} */ (data);

  if (d.version !== SAVE_VERSION) return false;
  if (!Array.isArray(d.stock) || !Array.isArray(d.waste)) return false;
  if (!Array.isArray(d.foundations) || d.foundations.length !== FOUNDATION_COUNT) return false;
  if (!Array.isArray(d.tableau) || d.tableau.length !== TABLEAU_COUNT) return false;
  if (!Array.isArray(d.history)) return false;
  if (typeof d.difficulty !== 'string' || !DIFFICULTY[d.difficulty]) return false;
  if (typeof d.moves !== 'number' || typeof d.score !== 'number') return false;
  if (typeof d.elapsedSeconds !== 'number' || typeof d.timerStarted !== 'boolean') return false;
  if (typeof d.drawCount !== 'number' || typeof d.maxRedeals !== 'number') return false;
  if (typeof d.redealsUsed !== 'number') return false;

  /** @type {import('./state.js').Card[]} */
  const all = [];
  for (const card of d.stock) {
    if (!isValidCard(card)) return false;
    all.push(/** @type {import('./state.js').Card} */ (card));
  }
  for (const card of d.waste) {
    if (!isValidCard(card)) return false;
    all.push(/** @type {import('./state.js').Card} */ (card));
  }
  for (const pile of d.foundations) {
    if (!Array.isArray(pile)) return false;
    for (const card of pile) {
      if (!isValidCard(card)) return false;
      all.push(/** @type {import('./state.js').Card} */ (card));
    }
  }
  for (const pile of d.tableau) {
    if (!Array.isArray(pile)) return false;
    for (const card of pile) {
      if (!isValidCard(card)) return false;
      all.push(/** @type {import('./state.js').Card} */ (card));
    }
  }

  if (all.length !== DECK_SIZE) return false;
  const ids = new Set(all.map((c) => c.id));
  return ids.size === DECK_SIZE;
}

/**
 * 将存档写回运行时 state（不碰 timerId / drag 等瞬时字段）
 * @param {ReturnType<typeof serializeState>} data
 */
export function applySave(data) {
  state.stock = cloneCards(data.stock);
  state.waste = cloneCards(data.waste);
  state.foundations = data.foundations.map(cloneCards);
  state.tableau = data.tableau.map(cloneCards);
  state.moves = data.moves;
  state.score = data.score;
  state.elapsedSeconds = data.elapsedSeconds;
  state.timerStarted = data.timerStarted;
  state.difficulty = data.difficulty;
  state.drawCount = data.drawCount;
  state.maxRedeals = data.maxRedeals;
  state.redealsUsed = data.redealsUsed;
  state.history = data.history.map((entry) => {
    if (entry.type === 'draw') {
      return { type: 'draw', count: entry.count };
    }
    if (entry.type === 'recycle') {
      return {
        type: 'recycle',
        wasteSnapshot: cloneCards(entry.wasteSnapshot || []),
        redealsUsed: entry.redealsUsed,
      };
    }
    return {
      fromType: entry.fromType,
      fromIndex: entry.fromIndex,
      cardIndex: entry.cardIndex,
      toType: entry.toType,
      toIndex: entry.toIndex,
      cards: cloneCards(entry.cards || []),
      flippedColumn: entry.flippedColumn ?? null,
    };
  });
  state.drag = null;
  state.dropCommitPending = false;
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

/** 保存当前对局到 localStorage */
export function saveGame() {
  try {
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(serializeState()));
  } catch {
    // 配额满或隐私模式：忽略
  }
}

/**
 * 从 localStorage 恢复对局
 * @returns {boolean} 是否成功恢复
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(GAME_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!isValidSave(data)) {
      clearSavedGame();
      return false;
    }
    applySave(data);
    return true;
  } catch {
    clearSavedGame();
    return false;
  }
}

/** 清除存档 */
export function clearSavedGame() {
  try {
    localStorage.removeItem(GAME_STORAGE_KEY);
  } catch {
    // ignore
  }
}
