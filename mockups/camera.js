/* Camera mockup: live viewfinder with the chosen frame drawn on top,
 * 3-second countdown, and a saved JPEG made by the same draw code. */
(() => {
  'use strict';

  const { W, H, frames, ids, standIn, fontsReady } = window.SmileFrames;
  const $ = (id) => document.getElementById(id);
  const key = new URLSearchParams(location.search).get('f');
  const id = frames[key] ? key : ids[0];
  const frame = frames[id];

  const video = $('video'), overlay = $('overlay');
  const still = document.createElement('img');
  still.className = 'still';
  still.alt = 'Your Smile Frame photo';
  still.hidden = true;
  $('vf').insertBefore(still, overlay);
  let stream = null, standInCanvas = null, resultBlob = null, resultUrl = null, timer = null;

  document.querySelectorAll('.switch a').forEach((a) => {
    if (a.dataset.f === id) a.setAttribute('aria-current', 'page');
  });
  $('frame-name').textContent = frame.name;
  $('frame-blurb').textContent = frame.blurb;
  document.title = `${frame.name} · Smile Frame · Pune Smile Day`;

  function drawOverlay() {
    const r = overlay.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    overlay.width = Math.round(r.width * dpr);
    overlay.height = Math.round(r.height * dpr);
    const ctx = overlay.getContext('2d');
    ctx.setTransform(overlay.width / W, 0, 0, overlay.height / H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    frame.draw(ctx);
  }

  function useStandIn(msg) {
    standInCanvas = document.createElement('canvas');
    standInCanvas.width = W; standInCanvas.height = H;
    standIn(standInCanvas.getContext('2d'));
    still.src = standInCanvas.toDataURL('image/jpeg', 0.85);
    still.hidden = false;
    video.hidden = true;
    $('notice').textContent = msg;
    $('notice').hidden = false;
    $('shutter').disabled = false;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return useStandIn('This browser can’t open the camera, so a stand-in portrait is shown.');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1600 } },
        audio: false
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      video.hidden = false;
      still.hidden = true;
      $('notice').hidden = true;
      $('shutter').disabled = false;
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      useStandIn(denied
        ? 'Camera access was blocked, so a stand-in portrait is shown. Allow the camera and reload to see yourself.'
        : 'No camera found, so a stand-in portrait is shown.');
    }
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  /* Cover-crop the source to 4:5, mirrored for the live camera. */
  async function compose() {
    await fontsReady();
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (stream) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const scale = Math.max(W / vw, H / vh);
      const sw = W / scale, sh = H / scale;
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(standInCanvas, 0, 0);
    }
    frame.draw(ctx);
    return new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.9));
  }

  function setPhase(phase) {
    $('ready').hidden = phase === 'review';
    $('review').hidden = phase !== 'review';
    $('countdown').hidden = phase !== 'counting';
    $('shutter').disabled = phase === 'counting';
    overlay.hidden = phase === 'review';
  }

  function startCountdown() {
    let n = 3;
    setPhase('counting');
    const show = () => { $('countdown').innerHTML = `<span>${n}</span>`; };
    show();
    timer = setInterval(async () => {
      n -= 1;
      if (n > 0) return show();
      clearInterval(timer);
      timer = null;
      const flash = $('flash');
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
      try {
        resultBlob = await compose();
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(resultBlob);
        still.src = resultUrl;
        still.hidden = false;
        video.hidden = true;
        setPhase('review');
      } catch (e) {
        console.error(e);
        setPhase('ready');
        toast('Something went wrong taking the photo. Please try again.');
      }
    }, 1000);
  }

  function retake() {
    resultBlob = null;
    $('add').disabled = false;
    if (stream) {
      video.hidden = false;
      still.hidden = true;
    } else {
      still.src = standInCanvas.toDataURL('image/jpeg', 0.85);
    }
    setPhase('ready');
  }

  function fileName() { return `pune-smile-day-${id}-${Date.now()}.jpg`; }

  function save() {
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
        await navigator.share({ files: [file], text: 'Smile with Pune! #SmileDay #PuneSmileDay' });
      } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    } else {
      save();
    }
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  $('shutter').addEventListener('click', startCountdown);
  $('retake').addEventListener('click', retake);
  $('save').addEventListener('click', save);
  $('share').addEventListener('click', share);
  $('add').addEventListener('click', async () => {
    if (!resultBlob) return;
    $('add').disabled = true;
    try {
      await window.SmileStore.add(resultBlob, id);
      stopCamera();
      location.href = 'wall.html?new=1';
    } catch (e) {
      console.error(e);
      $('add').disabled = false;
      toast('Couldn’t save your photo on this phone. Please try again.');
    }
  });
  window.addEventListener('resize', drawOverlay);
  window.addEventListener('pagehide', stopCamera);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if (!stream && !timer && $('review').hidden && !standInCanvas) startCamera();
  });

  drawOverlay();
  fontsReady().then(drawOverlay);
  startCamera();
})();
