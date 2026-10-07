/* Smile Frame options for the mockups.
 * Every frame draws in a 1080x1350 space. The same draw() paints the live
 * viewfinder overlay and the saved JPEG, so what you see is what you get.
 * The photo sits underneath; each frame paints only its own ground,
 * stickers and lettering around the photo window.
 */
window.SmileFrames = (() => {
  'use strict';

  const W = 1080, H = 1350;
  const C = {
    amber: '#F5A623', sun: '#FFC93C', orange: '#F28C38', cream: '#FFF3D6',
    ink: '#2B1D0E', white: '#FFFFFF', paper: '#FFFDF7',
    mint: '#5CC8A1', coral: '#FF7A6B', sky: '#6CB8F0', lav: '#B49CF0',
    brown: '#6B3E1E', blue: '#3C69FC'
  };
  const FONT = '"Baloo 2", system-ui, sans-serif';
  const LETTERS = [C.orange, C.mint, C.coral, C.sky, C.lav, C.amber];

  /* ---------- primitives ---------- */

  function shadow(ctx, blur = 16, y = 6, alpha = 0.22) {
    ctx.shadowColor = `rgba(43, 29, 14, ${alpha})`;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetY = y;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Die-cut sticker: white outline + soft shadow under a filled shape. */
  function sticker(ctx, build, fill, outline = 12) {
    ctx.save();
    shadow(ctx);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.white;
    ctx.lineWidth = outline * 2;
    ctx.beginPath(); build(); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath(); build(); ctx.fill();
    ctx.restore();
  }

  let logoPath = null;
  /* Sakal logo, traced from the supplied artwork. Returns drawn height. */
  function logo(ctx, x, y, width, color) {
    const L = window.SAKAL_LOGO;
    if (!logoPath) logoPath = new Path2D(L.d);
    const s = width / L.w;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.fill(logoPath, 'evenodd');
    ctx.restore();
    return L.h * s;
  }

  /* Logo on a rounded pill, centred on (cx, cy). */
  function logoPill(ctx, cx, cy, logoW, bg, fg) {
    const L = window.SAKAL_LOGO;
    const lh = L.h * (logoW / L.w);
    const pw = logoW + lh * 0.95, ph = lh * 1.7;
    ctx.save();
    shadow(ctx);
    ctx.fillStyle = bg;
    ctx.beginPath(); roundRectPath(ctx, cx - pw / 2, cy - ph / 2, pw, ph, ph / 2); ctx.fill();
    ctx.restore();
    logo(ctx, cx - logoW / 2, cy - lh / 2, logoW, fg);
  }

  function face(ctx, x, y, r) {
    const k = r / 11;
    ctx.save();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(x - 3.4 * k, y - 1.6 * k, 1.35 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3.4 * k, y - 1.6 * k, 1.35 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6 * k; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 4.6 * k, y + 2.2 * k);
    ctx.bezierCurveTo(x - 3.4 * k, y + 5.8 * k, x + 3.4 * k, y + 5.8 * k, x + 4.6 * k, y + 2.2 * k);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 122, 107, .55)';
    ctx.beginPath(); ctx.ellipse(x - 6 * k, y + 1.6 * k, 1.6 * k, 1 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 6 * k, y + 1.6 * k, 1.6 * k, 1 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------- stickers ---------- */

  function sun(ctx, x, y, r, rot = 0) {
    const rays = 12, r0 = r * 0.92, r1 = r * 1.42, half = Math.PI / rays * 0.55;
    sticker(ctx, () => {
      for (let i = 0; i < rays; i++) {
        const a = rot + (i / rays) * Math.PI * 2;
        ctx.moveTo(x + Math.cos(a - half) * r0, y + Math.sin(a - half) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.lineTo(x + Math.cos(a + half) * r0, y + Math.sin(a + half) * r0);
        ctx.closePath();
      }
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }, C.sun, 10);
    face(ctx, x, y + r * 0.08, r * 0.72);
  }

  function daisy(ctx, x, y, r, petal, centre, rot = 0) {
    sticker(ctx, () => {
      for (let i = 0; i < 8; i++) {
        const a = rot + (i / 8) * Math.PI * 2;
        const px = x + Math.cos(a) * r * 0.55, py = y + Math.sin(a) * r * 0.55;
        ctx.moveTo(px + Math.cos(a) * r * 0.45, py + Math.sin(a) * r * 0.45);
        ctx.ellipse(px, py, r * 0.45, r * 0.24, a, 0, Math.PI * 2);
      }
    }, petal, 9);
    ctx.save();
    ctx.fillStyle = centre;
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function sparkle(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }

  function tape(ctx, x, y, w, h, rot, color) {
    const teeth = 5, t = 7;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.88;
    shadow(ctx, 6, 2, 0.12);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    for (let i = 1; i <= teeth; i++) ctx.lineTo(w / 2 + (i % 2 ? t : 0), -h / 2 + (h * i) / teeth);
    ctx.lineTo(-w / 2, h / 2);
    for (let i = teeth - 1; i >= 0; i--) ctx.lineTo(-w / 2 - (i % 2 ? t : 0), -h / 2 + (h * i) / teeth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* A Pune auto-rickshaw: yellow canopy, black body. Drawn ~200 x 150 at s = 1. */
  function rickshaw(ctx, x, y, s, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    const canopy = () => {
      ctx.moveTo(-92, -8);
      ctx.lineTo(-92, -52);
      ctx.quadraticCurveTo(-88, -80, -56, -80);
      ctx.lineTo(38, -80);
      ctx.quadraticCurveTo(82, -80, 98, -30);
      ctx.lineTo(104, -8);
      ctx.closePath();
    };
    const body = () => {
      ctx.moveTo(-98, -12);
      ctx.lineTo(104, -12);
      ctx.quadraticCurveTo(116, 26, 100, 44);
      ctx.lineTo(-98, 44);
      ctx.closePath();
    };
    const wheels = () => {
      ctx.moveTo(-34, 50); ctx.arc(-58, 50, 24, 0, Math.PI * 2);
      ctx.moveTo(96, 50); ctx.arc(72, 50, 24, 0, Math.PI * 2);
    };
    sticker(ctx, () => { canopy(); body(); wheels(); }, C.sun, 9);
    ctx.fillStyle = '#1E1E1E';
    ctx.beginPath(); body(); ctx.fill();
    ctx.beginPath(); wheels(); ctx.fill();
    ctx.fillStyle = '#9AA0A6';
    ctx.beginPath();
    ctx.moveTo(-49, 50); ctx.arc(-58, 50, 9, 0, Math.PI * 2);
    ctx.moveTo(81, 50); ctx.arc(72, 50, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.cream;
    ctx.beginPath(); roundRectPath(ctx, -74, -64, 74, 46, 12); ctx.fill();
    ctx.beginPath(); roundRectPath(ctx, 14, -64, 58, 46, 12); ctx.fill();
    ctx.fillStyle = C.sun;
    ctx.beginPath(); ctx.arc(104, 8, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.mint;
    ctx.fillRect(-98, 16, 202, 8);
    ctx.restore();
  }

  function crayon(ctx, x, y, len, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    const w = len * 0.2;
    const build = () => {
      roundRectPath(ctx, -len / 2, -w / 2, len * 0.8, w, w * 0.3);
      ctx.moveTo(len * 0.3, -w / 2 + 4);
      ctx.lineTo(len / 2, 0);
      ctx.lineTo(len * 0.3, w / 2 - 4);
      ctx.closePath();
    };
    sticker(ctx, build, color, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, .55)';
    ctx.fillRect(-len * 0.32, -w / 2, len * 0.06, w);
    ctx.fillRect(len * 0.12, -w / 2, len * 0.06, w);
    ctx.restore();
  }

  /* ---------- lettering ---------- */

  function letterRun(ctx, letters, size, outline = C.white) {
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    letters.forEach((l) => {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.rot);
      if (outline) {
        ctx.save();
        shadow(ctx, 14, 6, 0.25);
        ctx.strokeStyle = outline;
        ctx.lineWidth = size * 0.2;
        ctx.strokeText(l.ch, 0, 0);
        ctx.restore();
      }
      ctx.fillStyle = l.color;
      ctx.fillText(l.ch, 0, 0);
      ctx.restore();
    });
  }

  /* Bubbly letters in a straight line, centred on cx, with a playful wobble. */
  function bubbly(ctx, text, cx, baseline, size, colors = LETTERS) {
    ctx.font = `800 ${size}px ${FONT}`;
    const chars = [...text];
    const gap = size * -0.02;
    const widths = chars.map((ch) => ctx.measureText(ch).width + gap);
    let x = cx - (widths.reduce((a, b) => a + b, 0) - gap) / 2;
    let ci = 0;
    const letters = chars.map((ch, i) => {
      const l = {
        ch, x: x + (widths[i] - gap) / 2,
        y: baseline + (i % 2 ? size * 0.04 : -size * 0.03),
        rot: (i % 3 - 1) * 0.07,
        color: ch === ' ' ? null : colors[ci++ % colors.length]
      };
      x += widths[i];
      return l;
    }).filter((l) => l.color);
    letterRun(ctx, letters, size);
  }

  /* Bubbly letters around the top of a circle centred on (cx, cy). */
  function bubblyArc(ctx, text, cx, cy, R, size, colors = LETTERS) {
    ctx.font = `800 ${size}px ${FONT}`;
    const chars = [...text];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let s = -total / 2, ci = 0;
    const letters = [];
    chars.forEach((ch, i) => {
      const a = -Math.PI / 2 + (s + widths[i] / 2) / R;
      s += widths[i];
      if (ch === ' ') return;
      letters.push({
        ch, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R,
        rot: a + Math.PI / 2 + (i % 2 ? 0.05 : -0.05),
        color: colors[ci++ % colors.length]
      });
    });
    letterRun(ctx, letters, size);
  }

  function text(ctx, str, x, y, size, weight, color, align = 'left') {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  /* ---------- frames ---------- */

  const frames = {
    arch: {
      name: 'Arch window',
      blurb: 'Your photo in a tall arch on a warm cream card, with a smiling sun, a flower and SMILE, PUNE! curving over the top.',
      draw(ctx) {
        const cx = 540, cy = 650, r = 470, bottom = 1170, rr = 44;
        const hole = () => {
          ctx.moveTo(cx - r, cy);
          ctx.arc(cx, cy, r, Math.PI, 0);
          ctx.lineTo(cx + r, bottom - rr);
          ctx.arcTo(cx + r, bottom, cx + r - rr, bottom, rr);
          ctx.lineTo(cx - r + rr, bottom);
          ctx.arcTo(cx - r, bottom, cx - r, bottom - rr, rr);
          ctx.closePath();
        };
        // Cream ground with the arch cut out
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, H); hole();
        ctx.fillStyle = C.cream;
        ctx.fill('evenodd');
        // Soft sun rays on the ground only
        ctx.clip('evenodd');
        ctx.fillStyle = 'rgba(255, 201, 60, .35)';
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2, h = 0.07;
          ctx.beginPath();
          ctx.moveTo(1000, 120);
          ctx.lineTo(1000 + Math.cos(a - h) * 700, 120 + Math.sin(a - h) * 700);
          ctx.lineTo(1000 + Math.cos(a + h) * 700, 120 + Math.sin(a + h) * 700);
          ctx.fill();
        }
        ctx.restore();
        // Arch rim
        ctx.save();
        ctx.beginPath(); hole();
        ctx.strokeStyle = C.amber;
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.restore();

        bubblyArc(ctx, 'SMILE, PUNE!', cx, cy, r + 14, 112);
        sun(ctx, 1000, 108, 62, 0.2);
        daisy(ctx, 92, 860, 66, C.coral, C.sun, 0.3);
        sparkle(ctx, 140, 230, 34, C.amber);
        sparkle(ctx, 1030, 980, 28, C.mint);
        sparkle(ctx, 60, 1100, 22, C.sky);

        text(ctx, '#SmileDay', 70, 1268, 104, 800, C.ink);
        text(ctx, 'PUNE SMILE DAY · 1 NOV', 74, 1318, 32, 700, C.orange);
        logoPill(ctx, 862, 1262, 236, C.ink, C.white);
      }
    },

    polaroid: {
      name: 'Polaroid',
      blurb: 'A tilted instant photo taped onto amber, with a rickshaw and a smiling sun stuck on. The blue Sakal logo sits on the white strip.',
      draw(ctx) {
        const tilt = -0.035;
        const card = { x: 70, y: 90, w: 940, h: 1160 };
        const photo = { x: 106, y: 126, w: 868, h: 910 };
        // Amber ground outside the card (the card rect is added while tilted)
        ctx.save();
        const base = ctx.getTransform();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.translate(540, 675); ctx.rotate(tilt); ctx.translate(-540, -675);
        ctx.rect(card.x, card.y, card.w, card.h);
        ctx.setTransform(base);
        ctx.fillStyle = C.amber;
        ctx.fill('evenodd');
        ctx.clip('evenodd');
        ctx.fillStyle = C.sun;
        [[0, 0, 280], [1080, 1350, 320], [1090, 260, 150], [-20, 980, 120]].forEach(([x, y, r]) => {
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();

        // White card around the photo
        ctx.save();
        ctx.translate(540, 675); ctx.rotate(tilt); ctx.translate(-540, -675);
        ctx.save();
        shadow(ctx, 30, 12, 0.28);
        ctx.beginPath();
        ctx.rect(card.x, card.y, card.w, card.h);
        ctx.rect(photo.x, photo.y, photo.w, photo.h);
        ctx.fillStyle = C.paper;
        ctx.fill('evenodd');
        ctx.restore();
        text(ctx, '#SmileDay', 128, 1146, 96, 800, C.ink);
        text(ctx, 'Pune Smile Day · 1 Nov', 132, 1198, 36, 600, '#6B5A45');
        logo(ctx, 974 - 230, 1104, 230, C.blue);
        ctx.restore();

        tape(ctx, 190, 112, 230, 62, -0.42, C.mint);
        tape(ctx, 900, 104, 220, 62, 0.38, C.coral);
        sun(ctx, 150, 1000, 66, 0.1);
        rickshaw(ctx, 905, 990, 0.95, -0.08);
        sparkle(ctx, 1040, 560, 30, C.white);
        sparkle(ctx, 36, 640, 24, C.white);
        sparkle(ctx, 1030, 1290, 26, C.white);
      }
    },

    doodle: {
      name: 'Doodle mirror',
      blurb: 'A big rounded window ringed with colourful bubbles, crayons and a sunflower, like a hand-decorated mirror. The most face, the most fun.',
      draw(ctx) {
        const win = { x: 80, y: 170, w: 920, h: 1050, r: 150 };
        const hole = () => roundRectPath(ctx, win.x, win.y, win.w, win.h, win.r);

        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, W, H); hole();
        ctx.fillStyle = C.amber;
        ctx.fill('evenodd');
        ctx.clip('evenodd');
        // Bubbles walk the frame's centre line
        const colors = [C.orange, C.mint, C.sun, C.coral, C.sky, C.lav];
        const line = [[40, 85], [1040, 85], [1040, 1285], [40, 1285], [40, 85]];
        let n = 0;
        for (let s = 0; s < line.length - 1; s++) {
          const [x0, y0] = line[s], [x1, y1] = line[s + 1];
          const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.round(len / 150);
          for (let i = 0; i < steps; i++) {
            const t = i / steps;
            const rad = 92 + ((n * 37) % 5) * 12;
            ctx.fillStyle = colors[n % colors.length];
            ctx.beginPath();
            ctx.arc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rad, 0, Math.PI * 2);
            ctx.fill();
            n++;
          }
        }
        ctx.restore();
        ctx.save();
        ctx.beginPath(); hole();
        ctx.strokeStyle = C.white;
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.restore();

        bubbly(ctx, '#SMILEDAY', 540, 178, 132);
        sun(ctx, 1000, 330, 60, 0.15);
        crayon(ctx, 1015, 720, 190, 1.2, C.coral);
        crayon(ctx, 62, 420, 170, -1.35, C.sky);
        daisy(ctx, 105, 1175, 82, C.sun, C.brown, 0.2);
        sparkle(ctx, 1010, 980, 30, C.white);
        sparkle(ctx, 70, 760, 24, C.white);

        logoPill(ctx, 420, 1282, 250, C.ink, C.white);
        ctx.save();
        ctx.translate(800, 1278);
        ctx.rotate(-0.06);
        ctx.font = `800 40px ${FONT}`;
        const lw = ctx.measureText('PUNE · 1 NOV').width + 56;
        ctx.save();
        shadow(ctx);
        ctx.fillStyle = C.white;
        ctx.beginPath(); roundRectPath(ctx, -lw / 2, -38, lw, 76, 38); ctx.fill();
        ctx.restore();
        text(ctx, 'PUNE · 1 NOV', 0, 14, 40, 800, C.ink, 'center');
        ctx.restore();
      }
    }
  };

  /* A flat stand-in portrait, used when no camera is available. */
  function standIn(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#CFE6F5');
    g.addColorStop(1, '#9CC7E4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2D3A4F';
    ctx.beginPath(); ctx.ellipse(W / 2, H + 120, 470, 430, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#A86F4C';
    ctx.fillRect(W / 2 - 70, 720, 140, 200);
    ctx.beginPath(); ctx.ellipse(W / 2, 560, 210, 260, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2A1E17';
    ctx.beginPath(); ctx.ellipse(W / 2, 430, 228, 150, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2 - 74, 560, 13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2 + 74, 560, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2A1E17'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(W / 2 - 90, 650); ctx.quadraticCurveTo(W / 2, 730, W / 2 + 90, 650); ctx.stroke();
  }

  function fontsReady() {
    return Promise.all([
      document.fonts.load(`800 120px ${FONT}`),
      document.fonts.load(`700 32px ${FONT}`),
      document.fonts.load(`600 36px ${FONT}`)
    ]).catch(() => {});
  }

  return { W, H, frames, ids: Object.keys(frames), standIn, fontsReady };
})();
