Paste this into Claude Code after opening the `pune-smile-day` folder:

---

This folder is a working prototype of the Pune Smile Day mobile web app. Read CLAUDE.md and README.md first, then run it locally and check it in a phone-sized viewport.

Next, I want to take it to production:
1. Add a shared backend (Supabase unless you see a strong reason not to). Uploaded photos start as pending and the public wall shows only approved photos, newest first.
2. Build a simple password-protected admin page to approve or reject photos.
3. Make the smile counter and the wall update live.
4. Add a `?display=1` big-screen mode of the wall for the event screen and the live-stream overlay.

Keep the existing look exactly as it is (the colours, fonts and smiley motifs listed in CLAUDE.md), and keep the app light for mobile data. Before writing code, give me a short plan and tell me which keys or accounts I need to set up.
