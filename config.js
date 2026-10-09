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
  colors: {
    purple: '#5B32A3',
    peach: '#FFCCB5',
    cardEnd: '#5E2D9B',
    yellow: '#F3C11B',
    white: '#FFFFFF'
  },
  // Emoji stickers around the frame, in design pixels (390-wide artboard,
  // origin at the top of the frame area). Temporary Fluent 3D emoji (MIT)
  // until the design team's sticker files arrive.
  stickers: [
    { src: 'assets/emoji/winking_face_with_tongue.webp', x: 54, y: 53, size: 85, rotate: -8 },
    { src: 'assets/emoji/smiling_face_with_heart-eyes.webp', x: 339, y: 44, size: 87, rotate: 6 },
    { src: 'assets/emoji/smiling_face_with_halo.webp', x: 355, y: 170, size: 56, rotate: 0 },
    { src: 'assets/emoji/face_with_hand_over_mouth.webp', x: 41, y: 228, size: 56, rotate: 0 },
    { src: 'assets/emoji/smiling_face_with_hearts.webp', x: 80, y: 348, size: 85, rotate: -6 },
    { src: 'assets/emoji/smiling_face_with_sunglasses.webp', x: 333, y: 370, size: 94, rotate: 4 }
  ],
  // Sample cards shown on the wall for the demo (cut from the design; replace
  // with the design team's photos when they arrive).
  samples: [
    { src: 'assets/samples/sample-1.jpg', alt: 'Sample Smile Frame: a smiling woman making a heart with her hands' },
    { src: 'assets/samples/sample-2.jpg', alt: 'Sample Smile Frame: a mother and two daughters smiling' }
  ]
};
