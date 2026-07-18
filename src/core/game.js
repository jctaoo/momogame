/**
 * 核心游戏操作：移动、抽牌、撤销、计时、新局
 */

import { play } from 'cuelume';
import { DIFFICULTY, RANK_VALUE } from '../constants.js';
import { state, resetStats, clearPiles } from './state.js';
import { dealBestLayout } from './deck.js';
import { canMoveToFoundation, canMoveToTableau, isWon } from './rules.js';
import { saveGame } from './persist.js';

/** UI 回调，由 main 注入，避免 core 反向依赖 ui */
let onRender = () => {};
let onWin = () => {};
let onStatsUpdate = () => {};

/**
 * 注入渲染与胜负回调
 * @param {{ render: Function, onWin: Function, updateStats: Function }} hooks
 */
export function bindGameHooks(hooks) {
  onRender = hooks.render;
  onWin = hooks.onWin;
  onStatsUpdate = hooks.updateStats;
}

/** 启动计时器 */
export function startTimer() {
  state.timerStarted = true;
  if (state.timerId) clearInterval(state.timerId);

  state.timerId = setInterval(() => {
    state.elapsedSeconds++;
    onStatsUpdate();
  }, 1000);
}

/**
 * 格式化用时为 mm:ss
 * @param {number} [seconds]
 * @returns {string}
 */
export function formatTime(seconds = state.elapsedSeconds) {
  const min = String((seconds / 60) | 0).padStart(2, '0');
  const sec = String(seconds % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

/**
 * 按牌 ID 从来源取出牌叠
 * 桌面列：从命中牌起一直取到列尾（该牌 + 其下方全部），禁止只抽中间一张
 * @param {import('./state.js').Card[]} cards
 * @param {string} fromType
 * @param {number} fromIndex
 * @returns {{ moved: import('./state.js').Card[], resolvedIndex: number }|null}
 */
function takeCardsFromSource(cards, fromType, fromIndex) {
  if (!cards.length) return null;
  const headId = cards[0].id;

  if (fromType === 'w') {
    if (!state.waste.length || state.waste[state.waste.length - 1].id !== headId) {
      return null;
    }
    return { moved: [state.waste.pop()], resolvedIndex: state.waste.length };
  }

  if (fromType === 'f') {
    const pile = state.foundations[fromIndex];
    if (!pile.length || pile[pile.length - 1].id !== headId) return null;
    return { moved: [pile.pop()], resolvedIndex: pile.length };
  }

  if (fromType === 't') {
    const pile = state.tableau[fromIndex];
    const start = pile.findIndex((c) => c.id === headId);
    if (start < 0) return null;
    // 整段后缀一起移走，绝不拆出中间单张
    const moved = pile.splice(start);
    return { moved, resolvedIndex: start };
  }

  return null;
}

/**
 * 执行一次合法移动
 * @param {import('./state.js').Card[]} cards - 要移动的牌（可多张叠）
 * @param {string} fromType - 来源 'w' | 't' | 'f'
 * @param {number} fromIndex - 来源列索引
 * @param {number} cardIndex - 桌面列中起始牌索引（仅写入历史，实际移除按 ID）
 * @param {string} toType - 目标 'f' | 't'
 * @param {number} toIndex - 目标列索引
 * @param {boolean} [withSound=true]
 * @returns {boolean} 是否成功执行
 */
export function executeMove(cards, fromType, fromIndex, cardIndex, toType, toIndex, withSound = true) {
  const taken = takeCardsFromSource(cards, fromType, fromIndex);
  if (!taken) return false;

  const { moved, resolvedIndex } = taken;

  // 基础区只收单张；多张则整段放回并拒绝（禁止从叠中抽走单张）
  if (toType === 'f' && moved.length !== 1) {
    if (fromType === 't') state.tableau[fromIndex].push(...moved);
    else if (fromType === 'w') state.waste.push(...moved);
    else if (fromType === 'f') state.foundations[fromIndex].push(...moved);
    return false;
  }

  // 记录撤销信息
  state.history.push({
    fromType,
    fromIndex,
    cardIndex: resolvedIndex,
    toType,
    toIndex,
    cards: moved.map((c) => ({ ...c })),
    flippedColumn: null,
  });

  if (toType === 'f') {
    state.foundations[toIndex].push(moved[0]);
    state.score += 10;
  } else if (toType === 't') {
    // 整段牌叠原序落入目标列
    state.tableau[toIndex].push(...moved);
    if (fromType === 'w') state.score += 5;
    if (fromType === 'f') state.score = Math.max(0, state.score - 10);
  }

  // 桌面列移走后翻开新顶牌
  let exposed = false;
  if (fromType === 't' && state.tableau[fromIndex].length) {
    const last = state.tableau[fromIndex][state.tableau[fromIndex].length - 1];
    if (!last.faceUp) {
      last.faceUp = true;
      state.score += 5;
      state.history[state.history.length - 1].flippedColumn = fromIndex;
      exposed = true;
    }
  }

  if (withSound) {
    // 翻开新牌 toggle；其余 release
    play(exposed ? 'toggle' : 'release');
  }

  state.moves++;
  if (!state.timerStarted) startTimer();
  saveGame();
  return true;
}

/**
 * 点击牌库：翻牌或将废牌回收
 */
export function drawFromStock() {
  if (!state.stock.length) {
    if (!state.waste.length) {
      play('droplet');
      return;
    }
    // 检查重发上限
    if (state.maxRedeals >= 0 && state.redealsUsed >= state.maxRedeals) {
      play('droplet');
      return;
    }

    state.history.push({
      type: 'recycle',
      wasteSnapshot: state.waste.map((c) => ({ ...c })),
      redealsUsed: state.redealsUsed,
    });

    while (state.waste.length) {
      const card = state.waste.pop();
      card.faceUp = false;
      state.stock.push(card);
    }
    state.redealsUsed++;
    state.score = Math.max(0, state.score - 20);
  } else {
    const count = Math.min(state.drawCount, state.stock.length);
    state.history.push({ type: 'draw', count });

    for (let i = 0; i < count; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
  }

  play('toggle');
  state.moves++;
  if (!state.timerStarted) startTimer();
  saveGame();
  onRender();
}

/**
 * 取桌面列从 cardIndex 起的整段牌叠（该牌 + 下方全部）
 * @param {number} sourceIndex
 * @param {number} cardIndex
 * @returns {import('./state.js').Card[]}
 */
export function getTableauStack(sourceIndex, cardIndex) {
  const pile = state.tableau[sourceIndex];
  if (!pile || cardIndex < 0 || cardIndex >= pile.length) return [];
  return pile.slice(cardIndex);
}

/**
 * 计算双击自动移动的目标（不执行）
 * 桌面列始终带着点中牌及其下方整段一起移动；基础区仅允许单张
 * @param {string} fromType
 * @param {number} sourceIndex
 * @param {number} cardIndex
 * @returns {{ card: import('./state.js').Card, cards: import('./state.js').Card[], toType: string, toIndex: number }|null}
 */
export function findAutoMoveTarget(fromType, sourceIndex, cardIndex) {
  /** @type {import('./state.js').Card[]} */
  let cards;

  if (fromType === 'w') {
    if (!state.waste.length) return null;
    cards = [state.waste[state.waste.length - 1]];
  } else if (fromType === 't') {
    cards = getTableauStack(sourceIndex, cardIndex);
  } else if (fromType === 'f') {
    const pile = state.foundations[sourceIndex];
    if (!pile.length) return null;
    cards = [pile[pile.length - 1]];
  } else {
    return null;
  }

  if (!cards.length) return null;
  const card = cards[0];

  // 1. 仅单张可进基础区（基础区顶张只考虑移回桌面）
  if (cards.length === 1 && fromType !== 'f') {
    for (let fi = 0; fi < 4; fi++) {
      if (canMoveToFoundation(card, fi)) {
        return { card, cards, toType: 'f', toIndex: fi };
      }
    }
  }

  // 2. 整段牌叠移到桌面列（用叠顶判定规则）
  let bestIndex = -1;
  let bestScore = -1;

  for (let ti = 0; ti < 7; ti++) {
    if (fromType === 't' && ti === sourceIndex) continue;
    if (!canMoveToTableau(card, ti)) continue;

    let score = 0;
    if (state.tableau[ti].length > 0) {
      score += 10;
      score += RANK_VALUE[state.tableau[ti][state.tableau[ti].length - 1].rank];
    }
    if (fromType === 't' && cardIndex > 0 && !state.tableau[sourceIndex][cardIndex - 1].faceUp) {
      score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = ti;
    }
  }

  if (bestIndex >= 0) {
    return { card, cards, toType: 't', toIndex: bestIndex };
  }

  return null;
}

/** 撤销上一步 */
export function undo() {
  if (!state.history.length) {
    play('droplet');
    return;
  }

  const entry = state.history.pop();

  if (entry.type === 'recycle') {
    // 撤销废牌回库
    const count = entry.wasteSnapshot.length;
    state.stock.splice(state.stock.length - count);
    entry.wasteSnapshot.forEach((card) => {
      card.faceUp = true;
      state.waste.push(card);
    });
    state.redealsUsed = entry.redealsUsed;
  } else if (entry.type === 'draw') {
    // 撤销翻牌
    const count = entry.count || 1;
    for (let i = 0; i < count; i++) {
      if (state.waste.length) {
        const card = state.waste.pop();
        card.faceUp = false;
        state.stock.push(card);
      }
    }
  } else {
    // 撤销普通移动
    if (entry.toType === 'f') {
      state.foundations[entry.toIndex].pop();
      state.score -= 10;
    } else if (entry.toType === 't') {
      state.tableau[entry.toIndex].splice(
        state.tableau[entry.toIndex].length - entry.cards.length
      );
      if (entry.fromType === 'w') state.score -= 5;
      if (entry.fromType === 'f') state.score += 10;
    }

    if (entry.fromType === 'w') {
      entry.cards.forEach((card) => {
        card.faceUp = true;
        state.waste.push(card);
      });
    } else if (entry.fromType === 't') {
      if (entry.flippedColumn !== null && state.tableau[entry.fromIndex].length) {
        state.tableau[entry.fromIndex][state.tableau[entry.fromIndex].length - 1].faceUp = false;
        state.score -= 5;
      }
      state.tableau[entry.fromIndex].push(...entry.cards);
    } else if (entry.fromType === 'f') {
      entry.cards.forEach((card) => {
        card.faceUp = true;
        state.foundations[entry.fromIndex].push(card);
      });
    }

    state.moves = Math.max(0, state.moves - 1);
  }

  play('whisper');
  saveGame();
  onRender();
}

/**
 * 应用难度设置
 * @param {string} difficulty
 */
export function applyDifficulty(difficulty) {
  state.difficulty = difficulty;
  const config = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  state.drawCount = config.drawCount;
  state.maxRedeals = config.maxRedeals;
  state.redealsUsed = 0;
}

/** 开始新一局 */
export function newGame() {
  resetStats();
  clearPiles();

  const select = document.getElementById('diff-select');
  applyDifficulty(select ? select.value : state.difficulty);

  document.getElementById('s-time').textContent = '00:00';
  document.getElementById('win-overlay').classList.remove('show');
  document.getElementById('auto-btn').style.display = 'none';

  const canvas = document.getElementById('fireworks');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  dealBestLayout();
  saveGame();
  onRender();
  play('bloom');
}

/**
 * 自动完成：循环把可收的牌送入基础区
 */
export function runAutoComplete() {
  play('sparkle');

  function step() {
    let moved = false;

    // 废牌顶
    if (state.waste.length) {
      for (let fi = 0; fi < 4; fi++) {
        if (canMoveToFoundation(state.waste[state.waste.length - 1], fi)) {
          executeMove(
            [state.waste[state.waste.length - 1]],
            'w', 0, state.waste.length - 1,
            'f', fi, false
          );
          onRender();
          moved = true;
          break;
        }
      }
    }

    // 桌面顶
    if (!moved) {
      for (let ti = 0; ti < 7; ti++) {
        if (!state.tableau[ti].length) continue;
        const card = state.tableau[ti][state.tableau[ti].length - 1];
        for (let fi = 0; fi < 4; fi++) {
          if (canMoveToFoundation(card, fi)) {
            executeMove(
              [card],
              't', ti, state.tableau[ti].length - 1,
              'f', fi, false
            );
            onRender();
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
    }

    if (moved) {
      setTimeout(step, 100);
    } else if (isWon()) {
      onWin();
    }
  }

  step();
}
