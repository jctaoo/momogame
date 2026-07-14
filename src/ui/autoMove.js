/**
 * 双击自动移动（带飞牌动画）
 */

import { play } from 'cuelume';
import { findAutoMoveTarget, executeMove } from '../core/game.js';
import {
  isAnimating,
  findSourceElements,
  getDropScreenPos,
  flyCards,
} from './animate.js';
import { clearHint } from './hint.js';

/**
 * 双击：查找目标 → 飞行动画 → 落子并重绘
 * @param {string} fromType
 * @param {number} sourceIndex
 * @param {number} cardIndex
 * @param {Function} onAfterMove - 通常为 render
 */
export async function autoMoveCard(fromType, sourceIndex, cardIndex, onAfterMove) {
  if (isAnimating()) return;

  clearHint();

  const target = findAutoMoveTarget(fromType, sourceIndex, cardIndex);
  if (!target) {
    play('droplet');
    return;
  }

  const sourceEls = findSourceElements(target.cards, fromType, sourceIndex);
  const dropPos = getDropScreenPos(target.toType, target.toIndex);

  // 双击飞行统一 whisper；落基础区另播 release
  play('whisper');

  if (sourceEls.length) {
    await flyCards(sourceEls, dropPos, 280);
  }

  executeMove(
    target.cards,
    fromType,
    sourceIndex,
    cardIndex,
    target.toType,
    target.toIndex,
    false
  );

  // 落定（基础区 / 桌面列）统一 release
  play('release');

  onAfterMove();
}
