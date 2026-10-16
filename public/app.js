/* Pune Smile Day — Smile Wall + Smile Frame camera (Sakal design team layout)
 * Vanilla JS, no build step. Photos go to the shared Smile Wall through the
 * Cloudflare Worker in worker/index.js (same origin, /api/*).
 */
(() => {
  'use strict';

  const CFG = window.SMILE_CONFIG;
  const $ = (id) => document.getElementById(id);

  /* ---------------- Smile Wall API (Cloudflare Worker, see worker/index.js) ---------------- */
  class ApiError extends Error {
    constructor(status, code) { super(code || `HTTP ${status}`); this.status = status; this.code = code; }
  }
  async function call(method, path, { body, headers } = {}) {
    const res = await fetch(path, { method, body, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error);
    return data;
  }
  /* Retries quietly after a dropped connection or a server error (5xx), waiting
   * a little longer each time, so a 9:00 AM rush or a busy cell tower spreads
   * out instead of failing. Real answers (429, 4xx) come back at once. */
  async function withRetry(fn, waits = CFG.uploadRetryMs) {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e) {
        const transient = !(e instanceof ApiError) || e.status >= 500;
        if (!transient || i >= waits.length) throw e;
        await new Promise((r) => setTimeout(r, waits[i] * (0.75 + Math.random() / 2)));
      }
    }
  }
  const api = {
    wall: (before) => call('GET', `/api/wall${before ? `?before=${before}` : ''}`),
    add: (blob) => withRetry(() => call('POST', '/api/photos', {
      body: blob, headers: { 'Content-Type': 'image/jpeg', 'X-Consent': CFG.consentVersion }
    })),
    remove: (id, token) => call('DELETE', `/api/photos/${id}`, { headers: { 'X-Delete-Token': token } }),
    report: (id) => call('POST', `/api/photos/${id}/report`),
    signup: (body) => withRetry(() => call('POST', '/api/signups', {
      body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }
    }))
  };

  /* Photos added from this phone, with the secret that lets this phone delete them.
   * localStorage can be missing (private mode), so every access is guarded. */
  const mine = {
    KEY: 'smileday-mine',
    all() {
      try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; }
    },
    save(list) {
      try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch {}
    },
    add(photo) { this.save([photo, ...this.all()]); },
    drop(id) { this.save(this.all().filter((p) => p.id !== id)); },
    get(id) { return this.all().find((p) => p.id === id); }
  };

  /* Smaller copy of the saved photo for the wall, so uploads are quick on mobile data. */
  async function makeUpload(blob) {
    const { width, height, quality } = CFG.upload;
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bmp, 0, 0, width, height);
    bmp.close();
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('resize failed'))), 'image/jpeg', quality));
  }

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

  /* Frame colours, read once from tokens.css so the canvas matches the page. */
  let colors = null;
  function frameColors() {
    if (!colors) {
      const css = getComputedStyle(document.documentElement);
      const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
      colors = {
        purple: get('--purple', '#5B32A3'), peach: get('--peach', '#FFCCB5'), cardEnd: get('--card-end', '#5E2D9B'),
        yellow: get('--yellow', '#F3C11B'), white: get('--white', '#FFFFFF')
      };
    }
    return colors;
  }

  /* Paints card, yellow window border, text and stickers. With photo = null
   * the window is left transparent so the live video shows through. */
  function drawFrame(ctx, { cardHeight, photo, background, mirror = true }) {
    const C = frameColors();
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
  const wallState = { ids: new Set(), next: null, loading: false, count: 0, closed: false, poll: null };
  const reported = new Set();      // hidden on this phone straight after reporting

  function setCount(n) {
    wallState.count = Math.max(0, n);
    $('smile-count').textContent = `${wallState.count.toLocaleString('en-IN')} ${wallState.count === 1 ? 'Smile' : 'Smiles'}`;
  }

  function setClosed(closed) {
    wallState.closed = closed;
    document.querySelector('.cta').hidden = closed;
    $('closed-note').hidden = !closed;
    $('closed-note').textContent = CFG.messages.closed;
  }

  async function renderWall() {
    const track = $('wall-grid');
    let data;
    try {
      data = await api.wall();
    } catch (e) {
      console.error('Could not load the wall', e);
      if (!track.children.length) {
        CFG.samples.forEach((s) => track.appendChild(sampleTile(s)));
        toast(CFG.messages.wallFailed);
      }
      return;
    }
    track.innerHTML = '';
    wallState.ids.clear();
    // A photo added seconds ago can still be in the upload queue or missing from
    // the briefly cached first page.
    const fresh = mine.all().filter((p) => Date.now() - p.t < 120000 &&!data.photos.some((q) => q.id === p.id));
    appendPhotos([...fresh, ...data.photos]);
    wallState.next = data.next;
    setCount(data.count + fresh.length);
    setClosed(data.closed);
    if (!data.next && wallState.ids.size < CFG.samplesUntil) CFG.samples.forEach((s) => track.appendChild(sampleTile(s)));
    track.scrollLeft = 0;
  }

  function appendPhotos(photos) {
    const track = $('wall-grid');
    const firstSample = track.querySelector('[data-sample]');
    photos.forEach((p) => {
      if (wallState.ids.has(p.id) || reported.has(p.id)) return;
      wallState.ids.add(p.id);
      track.insertBefore(tile(p), firstSample);
    });
  }

  /* Loads the next page when the carousel nears its end. */
  async function showMore() {
    if (!wallState.next || wallState.loading) return;
    wallState.loading = true;
    try {
      const data = await api.wall(wallState.next);
      appendPhotos(data.photos);
      wallState.next = data.next;
    } catch (e) {
      console.error('Could not load more photos', e);
    } finally {
      wallState.loading = false;
    }
  }

  /* While the wall is on screen, new smiles slide in at the front and the counter ticks up. */
  async function pollWall() {
    if (document.hidden || location.hash === '#camera') return;
    let data;
    try { data = await api.wall(); } catch { return; }
    const track = $('wall-grid');
    const newer = data.photos.filter((p) => !wallState.ids.has(p.id) && !reported.has(p.id));
    const width = track.scrollWidth;
    newer.reverse().forEach((p) => {
      wallState.ids.add(p.id);
      track.prepend(tile(p));
    });
    // Someone browsing further along keeps their place.
    if (track.scrollLeft > 0) track.scrollLeft += track.scrollWidth - width;
    setCount(data.count);
    setClosed(data.closed);
  }

  /* Sample cards are drawn with the real frame so they match a saved photo. */
  function sampleTile(sample) {
    const li = document.createElement('li');
    li.dataset.sample = '';
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

  /* One photo on the wall. Your own photos get a delete button, everyone else's a report button. */
  function tile(photo) {
    const own = !!mine.get(photo.id);
    const li = document.createElement('li');
    li.className = 'tile';
    li.dataset.id = photo.id;
    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = own ? 'Your Smile Frame' : 'A Smile Frame from the Smile Wall';
    img.loading = 'lazy';
    img.decoding = 'async';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tile__act${own ? ' tile__act--own' : ''}`;
    btn.setAttribute('aria-label', own ? 'Delete my photo' : 'Report this photo');
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${own ? 'trash' : 'flag'}"/></svg>`;
    btn.addEventListener('click', () => (own ? deleteMine(photo.id) : reportPhoto(photo.id)));
    li.append(img, btn);
    return li;
  }

  function dropTile(id) {
    const li = $('wall-grid').querySelector(`[data-id="${id}"]`);
    if (li) li.remove();
    wallState.ids.delete(id);
  }

  async function reportPhoto(id) {
    const ok = await ask({ title: 'Report this photo?', text: 'It will be hidden on your phone and our team will review it.', ok: 'Report' });
    if (!ok) return;
    reported.add(id);
    dropTile(id);
    toast(CFG.messages.reported);
    api.report(id).catch((e) => console.error('Report failed', e));
  }

  async function deleteMine(id) {
    const photo = mine.get(id);
    if (!photo) return false;
    const ok = await ask({ title: 'Delete your photo?', text: 'It will be removed from the Smile Wall and deleted for good.', ok: 'Delete' });
    if (!ok) return false;
    try {
      await api.remove(id, photo.token);
    } catch (e) {
      if (e.status !== 404) {   // 404: already gone (removed by a moderator, or the wall closed)
        toast('Could not delete your photo. Please try again.');
        return false;
      }
    }
    mine.drop(id);
    if (wallState.ids.has(id)) setCount(wallState.count - 1);
    dropTile(id);
    updateMineButton();
    toast(CFG.messages.deleted);
    return true;
  }

  /* ---------------- Sheets and toast ---------------- */
  function ask({ title, text, ok }) {
    const dlg = $('ask');
    $('ask-title').textContent = title;
    $('ask-text').textContent = text;
    $('ask-ok').textContent = ok;
    return new Promise((resolve) => {
      const done = (val) => {
        $('ask-ok').onclick = $('ask-cancel').onclick = dlg.onclose = null;
        if (dlg.open) dlg.close();
        resolve(val);
      };
      $('ask-ok').onclick = () => done(true);
      $('ask-cancel').onclick = () => done(false);
      dlg.onclose = () => done(false);
      dlg.showModal();
    });
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('toast--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('toast--on'), 3500);
  }

  function updateMineButton() {
    $('btn-mine').hidden = mine.all().length === 0;
  }

  function openMine() {
    const list = $('mine-list');
    list.innerHTML = '';
    mine.all().forEach((p) => {
      const li = document.createElement('li');
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = 'Your Smile Frame';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mine-list__del';
      btn.textContent = 'Delete';
      btn.addEventListener('click', async () => {
        $('mine').close();
        if (!(await deleteMine(p.id))) return;
        if (mine.all().length) openMine();
      });
      li.append(img, btn);
      list.appendChild(li);
    });
    $('mine').showModal();
  }

  function scrollWall(dir) {
    const track = $('wall-grid');
    const item = track.querySelector('li');
    if (!item) return;
    const step = item.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0);
    if (dir > 0) showMore();
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
  let facing = 'user';           // 'user' = selfie camera, 'environment' = back camera
  let mirrored = true;           // only the selfie view is mirrored
  let flipping = false;

  async function startCamera() {
    $('camera-error').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return showCameraError(CFG.camera.unsupported);
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false
      });
      video.srcObject = stream;
      const seen = stream.getVideoTracks()[0].getSettings().facingMode;   // what the browser really opened
      mirrored = (seen || facing) !== 'environment';
      $('stage').classList.toggle('stage--back', !mirrored);
      await video.play().catch(() => {});
      $('btn-shutter').disabled = false;
      showFlip();
    } catch (err) {
      console.error(err);
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      // Browsers don't ask twice: once blocked, only the site settings and a reload help.
      if (denied) showCameraError(webview ? `${CFG.camera.blocked} ${CFG.camera.webview}` : CFG.camera.blocked, true);
      else showCameraError(CFG.camera.busy);
    }
  }

  /* The switch button only appears when the phone has more than one camera. */
  async function showFlip() {
    let cams = 2;
    try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch (e) { /* show it anyway */ }
    $('btn-flip').hidden = cams < 2;
    $('btn-flip').setAttribute('aria-label', mirrored ? 'Switch to the back camera' : 'Switch to the front camera');
  }

  async function flipCamera() {
    if (phase !== 'ready' || flipping) return;
    flipping = true;
    $('btn-flip').disabled = true;
    const before = facing;
    facing = facing === 'user' ? 'environment' : 'user';
    stopCamera();
    await startCamera();
    if (!stream) {            // that camera wouldn't open: go back to the one that worked
      facing = before;
      await startCamera();
    }
    $('btn-flip').disabled = false;
    flipping = false;
  }

  function showCameraError(msg, blocked = false) {
    $('camera-error-msg').textContent = msg;
    $('btn-retry-camera').hidden = blocked;
    $('btn-reload-camera').hidden = !blocked;
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
    requestAnimationFrame(revealControls);
  }

  /* On short screens (in-app browsers) the shutter or the review buttons can sit
   * below the fold: scroll just enough to bring them into view. */
  function revealControls() {
    const el = phase === 'review' ? $('btn-retake') : phase === 'ready' ? $('btn-shutter') : null;
    if (el && el.getBoundingClientRect().bottom > innerHeight) el.scrollIntoView({ block: 'end' });
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
      resultBlob = await composeFrame(video, mirrored);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(resultBlob);
      result.src = resultUrl;
      setPhase('review');
      $('btn-add').disabled = false;
    } catch (e) {
      console.error(e);
      setPhase('ready');
      showCameraError(CFG.camera.failed);
    }
  }

  /* Draws the Smile Frame onto a canvas and returns a 1080 x 1350 JPEG blob. */
  async function composeFrame(source, mirror = true) {
    await Promise.all([fontsReady(), stickersReady]);
    const { width: W, height: H } = CFG.output;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const k = W / FRAME.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawFrame(ctx, { cardHeight: FRAME.cardHeightSaved, photo: source, background: true, mirror });
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

  /* "Add to the Smile Wall" first asks for consent, then uploads. */
  function addToWall() {
    if (!resultBlob) return;
    $('consent-public').checked = false;
    $('consent-age').checked = false;
    $('consent-ok').disabled = true;
    $('consent-ok').textContent = CFG.consent.ok;
    $('consent-error').hidden = true;
    $('consent').showModal();
  }

  async function confirmConsent() {
    const ok = $('consent-ok');
    ok.disabled = true;
    ok.textContent = 'Adding…';
    $('consent-error').hidden = true;
    try {
      const small = await makeUpload(resultBlob);
      const res = await api.add(small);
      mine.add({ id: res.id, url: res.url, token: res.deleteToken, t: Date.now() });
      updateMineButton();
      $('consent').close();
      $('btn-add').disabled = true;     // one photo per capture
      location.hash = '#wall';
      // Asked once per phone, after the photo is up, never before.
      if (signupSeen()) toast(CFG.messages.added);
      else openSignup(true);
    } catch (e) {
      console.error(e);
      const msg = e.status === 429 ? CFG.messages.slowDown
        : e.status === 410 ? CFG.messages.closed
        : CFG.messages.uploadFailed;
      $('consent-error').textContent = msg;
      $('consent-error').hidden = false;
      ok.textContent = CFG.consent.ok;
      ok.disabled = e.status === 410;
    }
  }

  /* ---------------- Event-update sign-up ----------------
   * Optional, after the photo is up (or from "Get event updates"). Google One Tap
   * or the Google button only fills in a verified email; the unticked consent box
   * is what signs someone up. The Google script loads only when the sheet opens. */
  const SIGNUP_KEY = 'smileday-signup';      // 'done' | 'dismissed' on this phone
  const signupState = () => { try { return localStorage.getItem(SIGNUP_KEY); } catch { return null; } };
  const signupSeen = () => !!signupState();
  const setSignup = (v) => { try { localStorage.setItem(SIGNUP_KEY, v); } catch {} };
  // Google blocks sign-in inside app webviews (Instagram, Facebook, Android WebView): type instead.
  const webview = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent);
  let credential = null, gis = null, gisReady = false;

  function loadGoogle() {
    if (!CFG.googleClientId || webview) return Promise.reject(new Error('Google sign-in unavailable'));
    gis ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => (window.google && google.accounts ? resolve(google.accounts.id) : reject(new Error('no google.accounts')));
      s.onerror = () => { gis = null; s.remove(); reject(new Error('Google script failed')); };
      document.head.appendChild(s);
    });
    return gis;
  }

  function jwtEmail(token) {
    try {
      const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)).email || '';
    } catch { return ''; }
  }

  function setGoogle(token) {
    credential = token;
    const email = token ? jwtEmail(token) : '';
    $('signup-gmail').hidden = !token;
    $('signup-gmail-text').textContent = email ? `✓ ${email}` : '';
    $('signup-email-field').hidden = !!token;
    if (token) $('signup-google').hidden = true;
    signupReady();
  }

  function signupReady() {
    const any = credential || $('signup-email').value.trim() || $('signup-phone').value.trim();
    $('signup-ok').disabled = !($('signup-consent').checked && any);
  }

  /* field: the input the message is about, so screen readers tie the two together. */
  function signupError(msg, field) {
    $('signup-error').textContent = msg;
    $('signup-error').hidden = !msg;
    ['signup-email', 'signup-phone'].forEach((id) => {
      const bad = !!msg && id === field;
      if (bad) { $(id).setAttribute('aria-invalid', 'true'); $(id).setAttribute('aria-describedby', 'signup-error'); }
      else { $(id).removeAttribute('aria-invalid'); $(id).removeAttribute('aria-describedby'); }
    });
    if (field) $(field).focus();
  }

  function openSignup(afterUpload) {
    const S = CFG.signup;
    $('signup-eyebrow').textContent = CFG.messages.added;
    $('signup-eyebrow').hidden = !afterUpload;
    $('signup-email').value = '';
    $('signup-phone').value = '';
    $('signup-consent').checked = false;
    $('signup-ok').textContent = S.ok;
    signupError('');
    setGoogle(null);
    $('signup').showModal();
    openSignupGoogle();
  }

  function openSignupGoogle() {
    loadGoogle().then((id) => {
      if (!$('signup').open || credential) return;
      if (!gisReady) {
        id.initialize({
          client_id: CFG.googleClientId,
          callback: (r) => { setGoogle(r.credential); signupError(''); },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signup',
          itp_support: true,
          use_fedcm_for_prompt: true,
          prompt_parent_id: 'signup-onetap'   // without FedCM (Safari) One Tap would sit behind the modal
        });
        gisReady = true;
      }
      $('signup-google').hidden = false;
      const box = $('signup-gbtn');
      box.innerHTML = '';
      id.renderButton(box, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'pill',
        text: 'continue_with', logo_alignment: 'center', width: Math.min(400, box.clientWidth || 300)
      });
      id.prompt();
    }).catch(() => { $('signup-google').hidden = true; });
  }

  function closeSignup(state) {
    if (state) setSignup(state);
    if ($('signup').open) $('signup').close();
    $('btn-updates').hidden = signupState() === 'done';
  }

  async function submitSignup(e) {
    e.preventDefault();
    const S = CFG.signup;
    const email = credential ? '' : $('signup-email').value.trim();
    const phone = $('signup-phone').value.replace(/[\s\-().]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
    if (!credential && !email && !phone) return signupError(S.needContact, 'signup-email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return signupError(S.badEmail, 'signup-email');
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return signupError(S.badPhone, 'signup-phone');
    const ok = $('signup-ok');
    ok.disabled = true;
    ok.textContent = 'Signing up…';
    signupError('');
    try {
      await api.signup({ consent: CFG.signupConsentVersion, credential: credential || undefined, email: email || undefined, phone: phone || undefined });
      closeSignup('done');
      toast(S.done);
    } catch (err) {
      console.error(err);
      if (err.code === 'google_invalid') setGoogle(null);
      const field = { invalid_email: 'signup-email', invalid_phone: 'signup-phone', contact_required: 'signup-email' }[err.code];
      signupError({
        invalid_email: S.badEmail, invalid_phone: S.badPhone, contact_required: S.needContact, google_invalid: S.googleFailed
      }[err.code] || (err.status === 429 ? CFG.messages.slowDown : S.failed), field);
      ok.textContent = S.ok;
      signupReady();
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
    if (view === 'camera' && wallState.closed) { location.hash = '#wall'; return; }
    window.scrollTo(0, 0);
    if (view === 'camera') {
      facing = 'user';        // always start on the selfie camera
      setPhase('ready');
      startCamera();
    } else {
      stopCamera();
      renderWall();
    }
  }

  const consentReady = () => {
    $('consent-ok').disabled = !($('consent-public').checked && $('consent-age').checked);
  };
  $('consent-title').textContent = CFG.consent.title;
  $('consent-public-text').textContent = CFG.consent.public;
  $('consent-age-text').textContent = CFG.consent.age;
  $('consent-note').textContent = CFG.consent.note;
  $('consent-cancel').textContent = CFG.consent.cancel;
  $('consent-public').addEventListener('change', consentReady);
  $('consent-age').addEventListener('change', consentReady);
  $('consent-ok').addEventListener('click', confirmConsent);
  $('consent-cancel').addEventListener('click', () => $('consent').close());
  const S = CFG.signup;
  $('signup-title').textContent = S.title;
  $('signup-text').textContent = S.text;
  $('signup-email-label').textContent = S.emailLabel;
  $('signup-phone-label').textContent = S.phoneLabel;
  $('signup-consent-text').textContent = S.consent;
  $('signup-note').textContent = S.note;
  $('signup-cancel').textContent = S.cancel;
  ['signup-email', 'signup-phone', 'signup-consent'].forEach((id) => $(id).addEventListener('input', signupReady));
  // Editing a field clears its error mark; the message stays until the next submit.
  ['signup-email', 'signup-phone'].forEach((id) => $(id).addEventListener('input', () => $(id).removeAttribute('aria-invalid')));
  $('signup-consent').addEventListener('change', signupReady);
  $('signup-form').addEventListener('submit', submitSignup);
  $('signup-cancel').addEventListener('click', () => closeSignup('dismissed'));
  $('signup').addEventListener('cancel', () => setSignup(signupState() || 'dismissed'));   // Esc / back
  $('signup').addEventListener('close', () => { if (gisReady) google.accounts.id.cancel(); });   // drop One Tap too
  $('signup-gmail-change').addEventListener('click', () => { setGoogle(null); openSignupGoogle(); });
  $('btn-updates').addEventListener('click', () => openSignup(false));
  $('btn-updates').hidden = signupState() === 'done';
  $('btn-mine').addEventListener('click', openMine);
  $('mine-close').addEventListener('click', () => $('mine').close());
  updateMineButton();
  wallState.poll = setInterval(pollWall, CFG.pollSeconds * 1000);

  $('date-chip').textContent = CFG.dateChip;
  $('home-tags').textContent = CFG.hashtags.join(' ');
  $('btn-shutter').addEventListener('click', startCountdown);
  $('btn-retake').addEventListener('click', retake);
  $('btn-add').addEventListener('click', addToWall);
  $('btn-download').addEventListener('click', download);
  $('btn-share').addEventListener('click', share);
  $('btn-retry-camera').addEventListener('click', startCamera);
  $('btn-reload-camera').addEventListener('click', () => location.reload());
  $('btn-flip').addEventListener('click', flipCamera);
  $('wall-grid').addEventListener('scroll', () => {
    const t = $('wall-grid');
    if (t.scrollWidth - t.scrollLeft - t.clientWidth < 400) showMore();
  }, { passive: true });
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
