// Event settings — edit these, not app.js.
window.SMILE_CONFIG = {
  eventName: 'Pune Smile Day',
  eventDateShort: '1 Nov',
  dateChip: '1 Nov · 9:00 AM',
  hashtag: '#SmileDay',
  hashtags: ['#SmileDay', '#PuneSmileDay'],
  frameSubtitle: 'Pune Smile Day · 1 Nov',
  shareText: 'Smile with Pune! #SmileDay #PuneSmileDay',
  countdownSeconds: 3,
  // Saved photo: the frame card on purple, 4:5 for Instagram and WhatsApp
  output: { width: 1080, height: 1350 },
  // Copy sent to the Smile Wall: smaller, so uploads are quick on mobile data
  upload: { width: 540, height: 675, quality: 0.82 },
  // If an upload fails on a bad connection or a busy server, wait this long (ms) and retry
  uploadRetryMs: [1000, 3000, 6000],
  // How often the wall checks for new smiles while it's on screen
  pollSeconds: 30,
  // Below this many photos, the sample cards fill out the wall
  samplesUntil: 6,

  // Consent (DPDP Act). If you change the wording, bump consentVersion here
  // AND CONSENT_VERSION in wrangler.toml, then redeploy.
  consentVersion: '2026-10-v1',
  consent: {
    title: 'Before your smile goes up',
    public: 'I agree that my photo will be shown publicly on the Smile Wall until 3 Nov 2026.',
    age: 'I am 18 or older, or I am the parent or guardian of everyone under 18 in this photo.',
    note: 'Sakal deletes every photo by 3 Nov 2026. You can delete yours sooner from this phone at any time.',
    ok: 'Add my photo',
    cancel: 'Not now'
  },
  // Event-update sign-ups (email and/or mobile), kept apart from photos. If you
  // change the wording, bump signupConsentVersion here AND SIGNUP_CONSENT_VERSION
  // in wrangler.toml. The keep-until date must match SIGNUPS_DELETE_AT there and privacy.html.
  // googleClientId: the OAuth client for "Continue with Google"; must match
  // GOOGLE_CLIENT_ID in wrangler.toml. Empty hides the Google button.
  googleClientId: '',
  signupConsentVersion: '2026-10-s1',
  signup: {
    title: 'Get Smile Day updates',
    text: 'Hear about Pune Smile Day and other Sakal events in Pune. Add your email, your mobile number, or both.',
    emailLabel: 'Email',
    phoneLabel: 'Mobile number (SMS and WhatsApp)',
    consent: 'I agree that Sakal may send me updates about Pune Smile Day and other Sakal events in Pune at the email or mobile number above. I can unsubscribe at any time.',
    note: 'Optional, and separate from your photo. We keep these details until 31 Oct 2027, or until you unsubscribe.',
    ok: 'Sign me up',
    cancel: 'No thanks',
    done: 'You’re signed up. Thank you!',
    needContact: 'Add your email or mobile number.',
    badEmail: 'Please check your email address.',
    badPhone: 'Please enter a 10-digit Indian mobile number.',
    googleFailed: 'Google sign-in didn’t work. Please type your email instead.',
    failed: 'Could not sign you up. Check your connection and try again.'
  },
  messages: {
    added: 'Your smile is on the wall!',
    deleted: 'Your photo has been deleted.',
    reported: 'Thanks. Our team will take a look.',
    uploadFailed: 'Could not add your photo. Check your connection and try again.',
    slowDown: 'Too many photos from this network right now. Please try again in a minute.',
    closed: 'The Smile Wall is closed. Thank you for smiling with Pune!',
    wallFailed: 'Could not load the Smile Wall. Please refresh the page.'
  },
  // Camera problems. "blocked" shows a Reload button, since browsers don't ask
  // twice; "webview" is added inside Instagram, Facebook and other app browsers.
  camera: {
    unsupported: 'This browser can’t open the camera. Open this page in Chrome or Safari.',
    blocked: 'Camera access is blocked for this page. Tap the icon next to the web address, allow Camera, then reload the page.',
    webview: 'If that doesn’t work, open this page in Chrome or Safari from the ⋮ or ··· menu.',
    busy: 'We couldn’t open the camera. Close other apps using it and try again.',
    failed: 'Something went wrong taking the photo. Please try again.'
  },
  // Frame colours come from tokens.css (--purple, --peach, --card-end, --yellow, --white).
  // Emoji stickers around the frame (design team files). Centre x/y and
  // size in design pixels: 390-wide artboard, origin at the top of the frame.
  stickers: [
    { src: 'assets/stickers/wink-tongue.png', x: 52, y: 55, w: 80, h: 80 },
    { src: 'assets/stickers/heart-eyes.png', x: 342.5, y: 47, w: 89, h: 84 },
    { src: 'assets/stickers/halo.png', x: 357.5, y: 167, w: 59, h: 58 },
    { src: 'assets/stickers/hand-over-mouth.png', x: 39, y: 229.5, w: 52, h: 55 },
    { src: 'assets/stickers/smiling-hearts.png', x: 81.5, y: 351, w: 83, h: 82 },
    { src: 'assets/stickers/sunglasses.png', x: 332, y: 372.5, w: 90, h: 89 }
  ],
  // Sample photos shown on the wall for the demo, framed like a real Smile Frame
  samples: [
    { photo: 'assets/samples/photo-1.png', alt: 'Sample Smile Frame: a smiling woman making a heart with her hands' },
    { photo: 'assets/samples/photo-2.png', alt: 'Sample Smile Frame: a mother and two daughters smiling' }
  ]
};
