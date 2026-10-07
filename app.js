/* Pune Smile Day — Smile Wall + Smile Frame camera
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

  /* ---------------- Wall ---------------- */
  const TILTS = [-3, 2, -1.5, 3, -2, 1.5, 2.5, -3, 1, -1, 3, -2.5];
  const TINTS = ['#FFE7B3', '#FFF1C9', '#FDD9B5'];
  const FACES = ['#F28C38', '#FFC93C', '#F5A623', '#F7B267'];
  let objectUrls = [];

  const smileySvg = (fill) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="${fill}"/><circle cx="8.6" cy="10" r="1.3" fill="#1F2A3A"/><circle cx="15.4" cy="10" r="1.3" fill="#1F2A3A"/><path d="M7.4 14c1.2 1.9 2.8 2.7 4.6 2.7s3.4-.8 4.6-2.7" fill="none" stroke="#1F2A3A" stroke-width="1.5" stroke-linecap="round"/></svg>`;

  async function renderWall() {
    const grid = $('wall-grid');
    objectUrls.forEach(URL.revokeObjectURL);
    objectUrls = [];
    let photos = [];
    try { photos = await store.list(); } catch (e) { console.error('Could not read photos', e); }

    $('smile-count').textContent = photos.length.toLocaleString('en-IN');
    grid.innerHTML = '';

    if (!photos.length) {
      // Placeholder tiles so the wall never looks empty
      for (let i = 0; i < 3; i++) grid.appendChild(polaroid({ index: i, placeholder: true }));
      const p = document.createElement('p');
      p.className = 'wall__empty';
      p.textContent = 'Be the first smile on the wall!';
      grid.appendChild(p);
      return;
    }

    photos.forEach((photo, i) => {
      const url = URL.createObjectURL(photo.blob);
      objectUrls.push(url);
      grid.appendChild(polaroid({
        index: i,
        url,
        number: photos.length - i,
        isNew: i === 0 && Date.now() - photo.createdAt < 2 * 60 * 1000
      }));
    });
  }

  function polaroid({ index, url, number, isNew, placeholder }) {
    const fig = document.createElement('figure');
    fig.className = 'polaroid' + (index % 2 ? ' polaroid--tape' : '');
    fig.style.setProperty('--tilt', TILTS[index % TILTS.length] + 'deg');
    fig.style.animationDelay = Math.min(index, 12) * 40 + 'ms';
    if (isNew) {
      const b = document.createElement('span');
      b.className = 'badge-new';
      b.textContent = 'JUST NOW';
      fig.appendChild(b);
    }
    if (placeholder) {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.style.background = TINTS[index % TINTS.length];
      ph.innerHTML = smileySvg(FACES[index % FACES.length]);
      fig.appendChild(ph);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Smile #${number}`;
      img.loading = 'lazy';
      fig.appendChild(img);
    }
    const cap = document.createElement('figcaption');
    cap.textContent = placeholder ? 'Your smile here' : `Smile #${number}`;
    fig.appendChild(cap);
    return fig;
  }

  /* ---------------- Camera ---------------- */
  const video = $('video');
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
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
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
    $('controls-ready').hidden = next !== 'ready';
    $('controls-counting').hidden = next !== 'counting';
    $('controls-review').hidden = next !== 'review';
    $('countdown').hidden = next !== 'counting';
    $('face-guide').hidden = next === 'review';
    $('result').hidden = next !== 'review';
    $('frame-card').hidden = next === 'review';
    $('camera-title').textContent = next === 'review' ? 'Looking great!' : 'Look at the camera & smile big';
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
      $('result').src = resultUrl;
      setPhase('review');
      $('btn-add').disabled = false;
    } catch (e) {
      console.error(e);
      setPhase('ready');
      showCameraError('Something went wrong taking the photo. Please try again.');
    }
  }

  /* Draws the branded Smile Frame onto a canvas and returns a JPEG blob. */
  async function composeFrame(source) {
    const { width: W, height: H } = CFG.output;
    const C = CFG.colors;
    try {
      await Promise.all([
        document.fonts.load(`800 120px "Bricolage Grotesque"`),
        document.fonts.load(`500 44px "DM Sans"`)
      ]);
    } catch (_) { /* fall back to system fonts */ }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Card background
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, W, H);

    // Circular photo, cover-cropped and mirrored to match the preview
    const cx = W / 2, cy = 560, r = 420, ring = 56;
    const vw = source.videoWidth, vh = source.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2, sy = (vh - side) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.scale(-1, 1);
    ctx.drawImage(source, sx, sy, side, side, -r, -r, r * 2, r * 2);
    ctx.restore();

    // Amber ring
    ctx.beginPath();
    ctx.arc(cx, cy, r + ring / 2 - 1, 0, Math.PI * 2);
    ctx.lineWidth = ring;
    ctx.strokeStyle = C.amber;
    ctx.stroke();

    // Smiley sticker, top-right
    drawSmiley(ctx, W - 170, 170, 105, C.orange, C.navy, 0.25);

    // Text
    ctx.textAlign = 'center';
    ctx.fillStyle = C.navy;
    ctx.font = `800 128px "Bricolage Grotesque", system-ui, sans-serif`;
    ctx.fillText(CFG.hashtag, W / 2, 1180);
    ctx.fillStyle = C.grey;
    ctx.font = `500 46px "DM Sans", system-ui, sans-serif`;
    ctx.fillText(`${CFG.eventName} · ${CFG.eventDateShort}`, W / 2, 1258);

    return new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.9));
  }

  function drawSmiley(ctx, x, y, radius, fill, ink, rotate) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotate);
    const k = radius / 11; // icon is drawn on a 24-unit grid, r = 11
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(-3.4 * k, -2 * k, 1.3 * k, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.4 * k, -2 * k, 1.3 * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1.5 * k; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4.6 * k, 2 * k);
    ctx.bezierCurveTo(-3.4 * k, 5.6 * k, 3.4 * k, 5.6 * k, 4.6 * k, 2 * k);
    ctx.stroke();
    ctx.restore();
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

  /* ---------------- Routing ---------------- */
  function route() {
    const view = location.hash === '#camera' ? 'camera' : 'wall';
    $('view-wall').hidden = view !== 'wall';
    $('view-camera').hidden = view !== 'camera';
    document.body.style.background = view === 'wall' ? '#FFF8E7' : '#1F2A3A';
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (view === 'camera') {
      setPhase('ready');
      startCamera();
    } else {
      stopCamera();
      renderWall();
    }
    window.scrollTo(0, 0);
  }

  $('btn-shutter').addEventListener('click', startCountdown);
  $('btn-retake').addEventListener('click', retake);
  $('btn-add').addEventListener('click', addToWall);
  $('btn-download').addEventListener('click', download);
  $('btn-share').addEventListener('click', share);
  $('btn-retry-camera').addEventListener('click', startCamera);
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && location.hash === '#camera') stopCamera();
    else if (!document.hidden && location.hash === '#camera' && !stream && phase === 'ready') startCamera();
  });

  route();
})();
