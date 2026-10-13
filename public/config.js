// Event settings — edit these, not app.js.
window.SMILE_CONFIG = {
  eventName: 'Pune Smile Day',
  eventDateShort: '1 Nov',
  dateChip: '1 Nov- 9:00 AM',
  hashtag: '#SmileDay',
  hashtags: ['#SmileDay', '#PuneSmileDay'],
  frameSubtitle: 'Pune Smile Day - 1 Nov',
  shareText: 'Smile with Pune! #SmileDay #PuneSmileDay',
  countdownSeconds: 3,
  // Saved photo: the frame card on purple, 4:5 for Instagram and WhatsApp
  output: { width: 1080, height: 1350 },
  // Copy sent to the Smile Wall: smaller, so uploads are quick on mobile data
  upload: { width: 540, height: 675, quality: 0.82 },
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
  messages: {
    added: 'Your smile is on the wall!',
    deleted: 'Your photo has been deleted.',
    reported: 'Thanks. Our team will take a look.',
    uploadFailed: 'Could not add your photo. Check your connection and try again.',
    slowDown: 'Too many photos from this network right now. Please try again in a minute.',
    closed: 'The Smile Wall is closed. Thank you for smiling with Pune!',
    wallFailed: 'Could not load the Smile Wall. Please refresh the page.'
  },
  colors: {
    purple: '#5B32A3',
    peach: '#FFCCB5',
    cardEnd: '#5E2D9B',
    yellow: '#F3C11B',
    white: '#FFFFFF'
  },
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
