/**
 * 视觉特效：烟花庆祝
 */

const FIREWORK_COLORS = [
  '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
  '#54a0ff', '#5f27cd', '#01a3a4', '#f368e0',
];

/**
 * 在画布上播放烟花动画
 */
export function playFireworks() {
  const canvas = document.getElementById('fireworks');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth;
  canvas.height = innerHeight;

  /** @type {Array<{x:number,y:number,vx:number,vy:number,life:number,decay:number,color:string,size:number}>} */
  const particles = [];

  function burst(x, y) {
    const color = FIREWORK_COLORS[(Math.random() * FIREWORK_COLORS.length) | 0];
    for (let i = 0; i < 50; i++) {
      const angle = (Math.PI * 2 / 50) * i + Math.random() * 0.3;
      const speed = 2 + Math.random() * 3.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.013 + Math.random() * 0.008,
        color,
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  let frame = 0;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    frame++;

    // 前半段间歇补放烟花
    if (frame % 35 === 0 && frame < 350) {
      burst(
        80 + Math.random() * (canvas.width - 160),
        80 + Math.random() * canvas.height * 0.45
      );
    }

    if (frame < 450) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  burst(canvas.width / 2, canvas.height * 0.3);
  animate();
}
