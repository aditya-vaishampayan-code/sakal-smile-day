/* Smile Frame options for the mockups.
 * Every frame draws in a 1080x1350 space. The same draw() paints the live
 * viewfinder overlay and the saved JPEG, so what you see is what you get.
 */
window.SmileFrames = (() => {
  'use strict';

  const W = 1080, H = 1350;
  const C = { amber: '#F5A623', orange: '#F28C38', ink: '#17130E', white: '#FFFFFF' };
  const FONT = '"Anek Latin", system-ui, sans-serif';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function softShadow(ctx) {
    ctx.shadowColor = 'rgba(0, 0, 0, .28)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
  }

  function smiley(ctx, x, y, r, fill, rotate) {
    const k = r / 11;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    ctx.save();
    softShadow(ctx);
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(-3.4 * k, -2 * k, 1.3 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.4 * k, -2 * k, 1.3 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5 * k; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4.6 * k, 2 * k);
    ctx.bezierCurveTo(-3.4 * k, 5.6 * k, 3.4 * k, 5.6 * k, 4.6 * k, 2 * k);
    ctx.stroke();
    ctx.restore();
  }

  /* Pill label: returns its width. align 'left' | 'right' anchors x. */
  function pill(ctx, { x, y, h, text, size, weight = 800, bg, fg, align = 'left', padX, shadow = true }) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const px = padX ?? h * 0.42;
    const w = ctx.measureText(text).width + px * 2;
    const left = align === 'right' ? x - w : x;
    ctx.save();
    if (shadow) softShadow(ctx);
    ctx.fillStyle = bg;
    roundRect(ctx, left, y, w, h, h / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, left + px, y + h / 2 + size * 0.06);
    return w;
  }

  /* Placeholder for the real Sakal logo file. */
  function logo(ctx, x, y, h, dark, align = 'left') {
    return pill(ctx, {
      x, y, h, text: 'SAKAL', size: h * 0.5, weight: 800, align,
      bg: dark ? C.ink : 'rgba(255, 255, 255, .94)', fg: dark ? C.white : C.ink
    });
  }

  /* Text set along a quadratic curve, centred on its length. */
  function textOnCurve(ctx, text, p0, p1, p2, size) {
    const N = 400, pts = [], lens = [0];
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      pts.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
      });
      if (i) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const L = lens[N];
    const at = (s) => {
      let i = 1;
      while (i < N && lens[i] < s) i++;
      const a = pts[i - 1], b = pts[i];
      const f = (s - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    ctx.font = `800 ${size}px ${FONT}`;
    const track = size * 0.08;
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width + track);
    const total = widths.reduce((s, w) => s + w, 0) - track;
    let s = (L - total) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chars.forEach((ch, i) => {
      const p = at(s + (widths[i] - track) / 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.fillText(ch, 0, size * 0.06);
      ctx.restore();
      s += widths[i];
    });
  }

  const frames = {
    a: {
      name: 'Corner signature',
      blurb: 'No border at all. A smiley sticker, the Sakal logo and a #SmileDay tag sit in the corners. Your face gets the whole photo.',
      cover: '≈ 8%',
      draw(ctx) {
        logo(ctx, 48, 48, 72, false);
        smiley(ctx, W - 132, 132, 78, C.orange, 0.26);
        pill(ctx, { x: 48, y: H - 48 - 62, h: 62, text: 'PUNE SMILE DAY · 1 NOV', size: 30, weight: 700, bg: C.ink, fg: C.white, padX: 26 });
        pill(ctx, { x: 48, y: H - 48 - 62 - 14 - 124, h: 124, text: '#SmileDay', size: 88, bg: C.amber, fg: C.ink, padX: 44 });
      }
    },

    b: {
      name: 'Amber border',
      blurb: 'A slim amber border with a short caption strip at the bottom: #SmileDay, the logo and the date. Reads like a branded print.',
      cover: '≈ 19%',
      draw(ctx) {
        const b = 28, band = 176;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        roundRect(ctx, b, b, W - b * 2, H - b - band, 34);
        ctx.fillStyle = C.amber;
        ctx.fill('evenodd');
        ctx.restore();
        const mid = H - band / 2 + 2;
        smiley(ctx, b + 56, mid, 46, C.orange, -0.12);
        ctx.fillStyle = C.ink;
        ctx.font = `800 92px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('#SmileDay', b + 124, mid + 6);
        logo(ctx, W - b - 4, mid - 66, 58, true, 'right');
        ctx.fillStyle = C.ink;
        ctx.font = `700 30px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText('PUNE · 1 NOV', W - b - 8, mid + 40);
      }
    },

    c: {
      name: 'Smile arc',
      blurb: 'One amber smile swept across the bottom of the photo, with the hashtag running along the curve. The photo itself smiles back.',
      cover: '≈ 10%',
      draw(ctx) {
        logo(ctx, 48, 48, 72, false);
        const p0 = { x: 74, y: 1100 }, p1 = { x: 540, y: 1400 }, p2 = { x: 1006, y: 1100 };
        ctx.save();
        softShadow(ctx);
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 118;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.ink;
        textOnCurve(ctx, '#SMILEDAY  ·  PUNE  ·  1 NOV', p0, p1, p2, 52);
      }
    }
  };

  /* A flat stand-in portrait, used when no camera is available. */
  function standIn(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#F3D7A8');
    g.addColorStop(1, '#D9A066');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2D3A4F';
    ctx.beginPath();
    ctx.ellipse(W / 2, H + 120, 470, 430, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#A86F4C';
    ctx.fillRect(W / 2 - 70, 720, 140, 200);
    ctx.beginPath();
    ctx.ellipse(W / 2, 560, 210, 260, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2A1E17';
    ctx.beginPath();
    ctx.ellipse(W / 2, 430, 228, 150, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#2A1E17';
    ctx.beginPath(); ctx.arc(W / 2 - 74, 560, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2 + 74, 560, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2A1E17'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, 650);
    ctx.quadraticCurveTo(W / 2, 730, W / 2 + 90, 650);
    ctx.stroke();
  }

  function fontsReady() {
    return Promise.all([
      document.fonts.load(`800 88px ${FONT}`),
      document.fonts.load(`700 30px ${FONT}`)
    ]).catch(() => {});
  }

  return { W, H, frames, standIn, fontsReady };
})();
