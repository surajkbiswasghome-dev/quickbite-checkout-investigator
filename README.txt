QuickBite Checkout Investigator - plug and play
================================================
What it is: a self-contained web prototype (HTML, CSS, JavaScript, no build step,
no installs, no database). Synthetic data only.

FASTEST WAY (works offline, no server)
  Double-click index.html. It opens in Chrome, Edge or Firefox.

OPTIONAL: run on a local server
  Windows : double-click start.bat
  Mac/Linux: run  sh start.sh
  then open http://localhost:8765

HOST IT ANYWHERE
  Upload this whole folder to any static host (Netlify, Vercel, GitHub Pages,
  S3, an internal web server). No settings needed.

SIGN IN
  Pick any of the four demo roles, type a name, press Continue. No password.
  Email recipients are limited to @quickbite.example (see config.js, "email").

LIVE AI vs NO AI
  Without a Claude sign-in the app shows a clearly labelled "First analysis (no AI)":
  tests run by code. Live AI agents (Investigator and Reviewer) run only when the
  page is opened inside Claude as a published artifact by a signed-in viewer.

FILES
  index.html   screens and logic        engine.js   all calculations
  config.js    roles, languages, flow   tickets.js  ticket store
  data.json / data.js  the dataset (data.js lets index.html run by double-click)
  api/news.js  optional news endpoint (not needed)
  tests/       unit and browser tests (optional; need node / python playwright)

Prepared by Suraj Kumar Biswas
