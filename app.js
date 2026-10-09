/* Pune Smile Day — Smile Wall + Smile Frame camera (Sakal design team layout)
 * Vanilla JS, no build step. Photos are stored on this device in IndexedDB.
 * See CLAUDE.md for how to swap the store for a shared backend.
 */
(() => {
  'use strict';

  const CFG = window.SMILE_CONFIG;
  const $ = (id) => document.getElementById(id);

  /* ---------------- Photo store (IndexedDB) ----------------
   * The rest of the app only uses store.list() / store.add(blob).
   * Replace this object with API calls to make the wall shared. */
  const store = (() => {
    const DB = 'smile-day', STORE = 'photos';
    let dbp;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }));
    const tx = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => res(r && r.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      list: () => tx('readonly', (s) => s.getAll()).then((rows) => (rows || []).sort((a, b) => b.createdAt - a.createdAt)),
      add: (blob) => tx('readwrite', (s) => s.add({ blob, createdAt: Date.now() }))
    };
  })();

  /* ---------------- Frame drawing ----------------
   * All numbers are design pixels on the 390-wide artboard, with the origin
   * at the top of the frame area (artboard y = 192). The same code paints the
   * live overlay over the camera and the saved photo. */
  const FRAME = {
    width: 390,
    savedHeight: 487.5,       // 4:5, so 1080 x 1350 when saved
    card: { x: 27, y: 30, w: 337 },
    cardHeightLive: 487,      // taller on the camera screen, under the shutter
    cardHeightSaved: 437,
    win: { x: 68, y: 60, w: 255, h: 320, border: 5 },
    tag: { y: 428, size: 30 },
    sub: { y: 452, size: 14 }
  };
  const inner = {
    x: FRAME.win.x + FRAME.win.border, y: FRAME.win.y + FRAME.win.border,
    w: FRAME.win.w - FRAME.win.border * 2, h: FRAME.win.h - FRAME.win.border * 2
  };

  const stickers = CFG.stickers.map((s) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = s.src;
    return { ...s, img };
  });
  const stickersReady = Promise.all(stickers.map((s) => s.img.decode().catch(() => {})));

  function fontsReady() {
    return Promise.all([
      document.fonts.load(`700 ${FRAME.tag.size}px Fredoka`),
      document.fonts.load(`500 ${FRAME.sub.size}px Poppins`)
    ]).catch(() => {});
  }

  /* Paints card, yellow window border, text and stickers. With photo = null
   * the window is left transparent so the live video shows through. */
  function drawFrame(ctx, { cardHeight, photo, background, mirror = true }) {
    const C = CFG.colors;
    const { card, win } = FRAME;

    if (background) {
      ctx.fillStyle = C.purple;
      ctx.fillRect(0, 0, FRAME.width, FRAME.savedHeight);
    }

    // Card with peach-to-purple gradient
    ctx.save();
    ctx.shadowColor = 'rgba(25, 8, 55, .45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    const g = ctx.createLinearGradient(0, card.y, 0, card.y + cardHeight);
    g.addColorStop(0, C.peach);
    g.addColorStop(1, C.cardEnd);
    ctx.fillStyle = g;
    ctx.fillRect(card.x, card.y, card.w, cardHeight);
    ctx.restore();

    // Yellow window border with a soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(40, 10, 60, .35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = C.yellow;
    ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.restore();

    if (photo) {
      drawCover(ctx, photo, inner.x, inner.y, inner.w, inner.h, mirror);
    } else {
      ctx.clearRect(inner.x, inner.y, inner.w, inner.h);
    }

    // #SmileDay and subtitle
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.white;
    ctx.font = `700 ${FRAME.tag.size}px Fredoka, Poppins, system-ui, sans-serif`;
    ctx.fillText(CFG.hashtag, FRAME.width / 2, FRAME.tag.y);
    ctx.fillStyle = C.yellow;
    ctx.font = `500 ${FRAME.sub.size}px Poppins, system-ui, sans-serif`;
    ctx.fillText(CFG.frameSubtitle, FRAME.width / 2, FRAME.sub.y);

    // Emoji stickers
    stickers.forEach((s) => {
      if (!s.img.complete || !s.img.naturalWidth) return;
      ctx.drawImage(s.img, s.x - s.w / 2, s.y - s.h / 2, s.w, s.h);
    });
  }

  /* Cover-crop a video or image into a box; mirror for the selfie camera. */
  function drawCover(ctx, src, x, y, w, h, mirror) {
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    const scale = Math.max(w / sw, h / sh);
    const cw = w / scale, ch = h / scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (mirror) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
    } else {
      ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
    }
    ctx.restore();
  }

  /* Live overlay on the camera screen. */
  function paintOverlay() {
    const canvas = $('frame-canvas');
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext('2d');
    const k = canvas.width / FRAME.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawFrame(ctx, { cardHeight: FRAME.cardHeightLive, photo: null, background: false });
  }

  /* ---------------- Wall ---------------- */
  let objectUrls = [];

  async function renderWall() {
    const track = $('wall-grid');
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls = [];
    let photos = [];
    try { photos = await store.list(); } catch (e) { console.error('Could not read photos', e); }

    track.innerHTML = '';
    photos.forEach((photo, i) => {
      const url = URL.createObjectURL(photo.blob);
      objectUrls.push(url);
      track.appendChild(tile(url, `Your Smile Frame, smile number ${photos.length - i}`));
    });
    CFG.samples.forEach((s) => track.appendChild(sampleTile(s)));
    track.scrollLeft = 0;
    const n = photos.length + CFG.samples.length;
    $('smile-count').textContent = `${n.toLocaleString('en-IN')} ${n === 1 ? 'Smile' : 'Smiles'}`;
  }

  /* Sample cards are drawn with the real frame so they match a saved photo. */
  function sampleTile(sample) {
    const li = document.createElement('li');
    const canvas = document.createElement('canvas');
    canvas.width = 780; canvas.height = 975;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', sample.alt);
    li.appendChild(canvas);
    const photo = new Image();
    photo.src = sample.photo;
    Promise.all([photo.decode(), stickersReady, fontsReady()]).then(() => {
      const ctx = canvas.getContext('2d');
      const k = canvas.width / FRAME.width;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawFrame(ctx, { cardHeight: FRAME.cardHeightSaved, photo, background: true, mirror: false });
    }).catch((e) => console.error('Sample card failed', e));
    return li;
  }

  function tile(src, alt) {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.loading = 'lazy';
    li.appendChild(img);
    return li;
  }

  function scrollWall(dir) {
    const track = $('wall-grid');
    const item = track.querySelector('li');
    if (!item) return;
    const step = item.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    const max = track.scrollWidth - track.clientWidth;
    let to = track.scrollLeft + dir * step;
    if (to > max + 1) to = 0;          // wrap around at the ends
    else if (to < -1) to = max;
    track.scrollTo({ left: to, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  /* ---------------- Camera ---------------- */
  const video = $('video');
  const result = document.createElement('img');
  result.id = 'result';
  result.className = 'result';
  result.alt = 'Your Smile Frame photo';
  result.hidden = true;
  $('stage').after(result);

  let stream = null;
  let phase = 'ready';           // ready | counting | review
  let resultBlob = null;
  let resultUrl = null;
  let countdownTimer = null;

  async function startCamera() {
    $('camera-error').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showCameraError('This browser can’t open the camera. Try Chrome or Safari, over https.');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      $('btn-shutter').disabled = false;
    } catch (err) {
      console.error(err);
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      showCameraError(denied
        ? 'Camera permission was blocked. Allow camera access in your browser settings, then try again.'
        : 'We couldn’t open the camera. Close other apps using it and try again.');
    }
  }

  function showCameraError(msg) {
    $('camera-error-msg').textContent = msg;
    $('camera-error').hidden = false;
    $('btn-shutter').disabled = true;
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  function setPhase(next) {
    phase = next;
    const review = next === 'review';
    $('controls-ready').hidden = next !== 'ready';
    $('controls-counting').hidden = next !== 'counting';
    $('controls-review').hidden = !review;
    $('countdown').hidden = next !== 'counting';
    $('stage').hidden = review;
    result.hidden = !review;
    const title = $('camera-title');
    title.innerHTML = review ? 'Looking great!' : 'Look at the camera<br>&amp; smile big';
    title.classList.toggle('camera__title--single', review);
    if (!review) requestAnimationFrame(paintOverlay);
  }

  function startCountdown() {
    if (phase !== 'ready' || !stream) return;
    setPhase('counting');
    let n = CFG.countdownSeconds;
    const show = () => { $('countdown').innerHTML = `<span>${n}</span>`; };
    show();
    countdownTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        capture();
      } else {
        show();
      }
    }, 1000);
  }

  async function capture() {
    const flash = $('flash');
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');

    try {
      resultBlob = await composeFrame(video);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(resultBlob);
      result.src = resultUrl;
      setPhase('review');
      $('btn-add').disabled = false;
    } catch (e) {
      console.error(e);
      setPhase('ready');
      showCameraError('Something went wrong taking the photo. Please try again.');
    }
  }

  /* Draws the Smile Frame onto a canvas and returns a 1080 x 1350 JPEG blob. */
  async function composeFrame(source) {
    await Promise.all([fontsReady(), stickersReady]);
    const { width: W, height: H } = CFG.output;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const k = W / FRAME.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawFrame(ctx, { cardHeight: FRAME.cardHeightSaved, photo: source, background: true });
    return new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.9));
  }

  function fileName() { return `pune-smile-day-${Date.now()}.jpg`; }

  function download() {
    if (!resultBlob) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share() {
    if (!resultBlob) return;
    const file = new File([resultBlob], fileName(), { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: CFG.shareText, title: CFG.eventName });
      } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    } else {
      // Desktop browsers usually can't share files: fall back to download
      download();
    }
  }

  async function addToWall() {
    if (!resultBlob) return;
    $('btn-add').disabled = true;
    try {
      await store.add(resultBlob);
      location.hash = '#wall';
    } catch (e) {
      console.error(e);
      $('btn-add').disabled = false;
      alert('Could not save your photo. Please try again.');
    }
  }

  function retake() {
    resultBlob = null;
    setPhase('ready');
  }

  /* ---------------- Slide to open camera ----------------
   * Hold the camera button and slide it right, like answering a call on iOS.
   * A plain tap (or keyboard Enter) still follows the link. */
  const cta = document.querySelector('.cta');
  const knob = cta.querySelector('.cta__icon');
  const GO_AT = 0.6;                 // fraction of the track to pass before release opens the camera
  let drag = null, suppressClick = false;

  /* --drag is in design pixels, so it scales with --u like everything else. */
  function setSlide(px, animate) {
    cta.classList.toggle('cta--settle', !!animate);
    cta.style.setProperty('--drag', px);
    cta.style.setProperty('--fade', 1 - Math.min(px / (drag ? drag.travel * 0.7 : 1), 1));
  }
  function resetSlide() {
    drag = null;
    cta.classList.remove('cta--dragging');
    cta.style.setProperty('--drag', 0);
    cta.style.setProperty('--fade', 1);
  }

  knob.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    const k = knob.getBoundingClientRect(), c = cta.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, u: k.width / 68, travel: (c.width - k.width) / (k.width / 68), px: 0, moved: false };
    knob.setPointerCapture(e.pointerId);
    cta.classList.add('cta--dragging');
  });
  knob.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    drag.px = Math.max(0, Math.min(dx / drag.u, drag.travel));
    setSlide(drag.px, false);
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { px, travel, moved } = drag;
    const go = e.type === 'pointerup' && px >= travel * GO_AT;
    cta.classList.remove('cta--dragging');
    if (moved) suppressClick = true;
    if (go) {
      setSlide(travel, true);
      setTimeout(() => { location.hash = '#camera'; }, 160);
    } else {
      setSlide(0, true);
    }
    drag = null;
  };
  knob.addEventListener('pointerup', endDrag);
  knob.addEventListener('pointercancel', endDrag);
  cta.addEventListener('dragstart', (e) => e.preventDefault());   // no ghost link image
  cta.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); suppressClick = false; }
  });

  /* ---------------- Routing ---------------- */
  function route() {
    const view = location.hash === '#camera' ? 'camera' : 'wall';
    $('view-wall').hidden = view !== 'wall';
    $('view-camera').hidden = view !== 'camera';
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    resetSlide();
    if (view === 'camera') {
      setPhase('ready');
      startCamera();
    } else {
      stopCamera();
      renderWall();
    }
    window.scrollTo(0, 0);
  }

  $('date-chip').textContent = CFG.dateChip;
  $('home-tags').textContent = CFG.hashtags.join('');
  $('btn-shutter').addEventListener('click', startCountdown);
  $('btn-retake').addEventListener('click', retake);
  $('btn-add').addEventListener('click', addToWall);
  $('btn-download').addEventListener('click', download);
  $('btn-share').addEventListener('click', share);
  $('btn-retry-camera').addEventListener('click', startCamera);
  $('car-prev').addEventListener('click', () => scrollWall(-1));
  $('car-next').addEventListener('click', () => scrollWall(1));
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (phase !== 'review') paintOverlay(); });
  stickersReady.then(() => fontsReady()).then(paintOverlay);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && location.hash === '#camera') stopCamera();
    else if (!document.hidden && location.hash === '#camera' && !stream && phase === 'ready') startCamera();
  });

  route();
})();
