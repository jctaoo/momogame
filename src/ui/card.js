/**
 * 卡牌 DOM 创建
 */

/**
 * 根据牌数据生成 DOM 元素
 * @param {import('../core/state.js').Card} card
 * @returns {HTMLElement}
 */
export function createCardElement(card) {
  const el = document.createElement('div');
  el.className = `card ${card.color} ${card.faceUp ? 'face-up' : 'face-down'}`;
  el.dataset.id = card.id;

  el.innerHTML = `
    <div class="card-inner card-front">
      <div class="corner tl">
        <span class="rk">${card.rank}</span>
        <span class="st">${card.suit}</span>
      </div>
      <div class="center-suit">${card.suit}</div>
      <div class="corner br">
        <span class="rk">${card.rank}</span>
        <span class="st">${card.suit}</span>
      </div>
    </div>
    <div class="card-inner card-back">
      <div class="card-back-inner"></div>
    </div>
  `;

  return el;
}

/**
 * 创建牌库背面占位牌（仅显示背面）
 * @returns {HTMLElement}
 */
export function createStockBackCard() {
  const el = createCardElement({
    color: 'black',
    faceUp: false,
    id: 'stock-back',
    rank: '',
    suit: '',
  });
  el.style.top = '0';
  el.querySelector('.card-front').style.display = 'none';
  const back = el.querySelector('.card-back');
  back.style.display = 'flex';
  back.style.zIndex = '2';
  return el;
}
