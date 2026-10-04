# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Architectural deep-dives that predate this file are preserved as historical
> narrative in [`docs/interno/historico-arquitetura-2026-05.md`](docs/interno/historico-arquitetura-2026-05.md). New changes are tracked
> here in the standardized Keep a Changelog format.

## [Unreleased]

### Added
- **The ChatGPT cover robot attaches a photo of each real person in the
  cover.** The thumbnail prompt now names them in a `referencias` tag, by
  their full Wikipedia title ("Lula" alone is the squid). Their photos come
  from the portrait bank (cache, then Wikipedia) and go after the mascot
  sheets, and the message says which file is who. Under "Gerar no ChatGPT"
  the cast shows each photo, so you can swap a wrong one (the upload goes to
  the bank), remove whoever is not a person, or add someone by name. Anyone
  left without a photo stays out. Older prompts get a suggestion read from
  `personagens`. To get the tag, update your channel's thumbnail scaffold in
  Canais (D-840).
- **Choose Chrome or Edge for the TikTok and Instagram robot.** Settings →
  Aplicação has a new "Navegador do robô" choice, saved per channel; Edge is
  the default (D-873). Edge gets its own session folder next to Chrome's
  (`browser/tiktok-edge`): Chrome encrypts its cookies with a key Edge cannot
  open, so sharing the folder would log both out. Log in once in the Edge
  window the first time (D-832).
- **"Publish on its own" also works for a single TikTok cut.** The switch that
  only the batch had now sits in the TikTok window next to "Marcar dia e hora",
  and applies to both the batch and each cut's "Assistido" button. The robot
  still publishes only when the cover went in (RN-26); a cut it published is
  marked right away, with no tab left to watch (D-834).
- **Short renders show up in the global queue, and can be cancelled.** Each
  preview or final render is a line of its own ("Short 2 (prévia): Recortar
  9:16"), waiting or running, so a cut that waits for a render slot shows who
  holds it. Cancel stops the task and the worker's ffmpeg/Remotion jobs, frees
  the slot, and the short's card says "cancelado" instead of spinning forever
  (D-844).
- **Click a small image to see it full size.** The TikTok cover, the Short
  cover and the mascot sheets in Canais now open large on click, without
  cropping, over any open window; click outside, the X or Esc closes only the
  image (D-821).

### Changed
- **Rare Workspace actions moved to a "Mais" menu.** Reanalisar, refazer
  transcrição, auditar análise and abrir a pasta were a row of unlabeled
  icons, each in its own color, in the middle of the screen. They are now
  labeled items in a "⋯ Mais" menu in the Workspace header, next to "Ver no
  YouTube" and "Novo corte"; "Auditar análise" explains why it is off when
  the live has no cuts. Screen headers can declare such a menu on any screen
  (D-867).
- **One trail of steps for a live.** A live had three step rulers with
  different names: the strip under the top bar (Workspace · Cortes · Pós ·
  Metadados · Revisão), the Workspace's "Etapas da live" band and its four
  number cards. Now every screen of a live shows one trail of seven steps —
  Baixado, Analisado, Cortes, Pós, Metadados, Revisão, Publicado — each with
  a ✓ when done and a count ("3 de 9"). The open screen's step is lit; on
  the Workspace, the step where the live stopped. Revisão counts the cuts
  ready to publish ("N de M prontos"). A cut already on air counts as done
  in every step before it, and a cleaned-up live counts as finished: since
  "Limpar" deletes the videos, Pós counts every approved cut and Revisão
  asks only for the title and cover, which live in the database — so an old
  live does not look stuck.
  Baixado and Analisado lead to the Workspace; Publicado opens it with a new
  "No ar" filter, shown as a chip that turns it off. The cards and the band
  are gone from the Workspace; what only the cards said (scheduled uploads,
  disk) moved to its subtitle (D-866).
- **One drawing per idea.** The same icon used to mean different things: the
  scissors were the Cuts step, "Edit cut" and "Generate trims"; the paper
  plane was the Ready menu and "Upload to TikTok"; play was "Play video" and
  "Enter the URL"; the magnifier was "Search" and "Audit". Now each idea of
  the flow has its own, drawn as in the design board: AI generates is the
  four-point sparkle, edit the pen, publish the upload arrow, ready the check
  circle, published URL the link and audit the checklist. Preparing a package
  to upload by hand shows a package, download shows a download arrow, and
  analysing with AI is always the brain. A test checks every action labelled
  with one of these ideas (D-858).
- **No emoji in the interface.** Emoji drawn as icons (the 🎞️ 🎭 🎨 of the
  cut steps, the 🎥 📋 🔢 of scene types, the 🧠 🧩 🛠 ⚖ of Channels, the
  ⚡ of the speed, the 📅 of the schedule, the 🔥 of an empty Shorts page and
  the ⚠ of warnings) came out of the icon scale, each system drawing its own.
  They are line icons now, and scene types keep their colour. The 🔥 and 📖
  that go into YouTube titles and covers stay: that is published content,
  not interface. A test fails any new emoji in the interface (D-858).
- **Text has an 11 px floor.** The app had 288 texts below 11 px, like the
  9.5 px uppercase mono of "PRONTO PARA LIMPAR". The status badges, the stage
  strip of the cut card, the AI provider badge and the Library counters are
  11 px now; in the side list the stage strip wraps between its groups, so
  the eight steps no longer run past the column. A test fails any new text
  below 11 px and keeps the remaining ones on a list that only shrinks
  (D-859).
- **One icon scale.** The app had 24 icon sizes (9 to 34 px) and strokes from
  0.3 to 3. Icons now go through one component with three sizes (14 px next to
  text, 16 px in buttons and bars, 20 px in the rail; big drawings use an
  explicit illustration size) and a single 1.75 stroke. Buttons draw their
  icon at 16 px instead of 13. Every screen now draws its icons this way,
  menus and AI buttons included, and a ratchet test fails any file that
  imports icons around the component (D-853 to D-857). Tests pin the icon of
  each menu item, AI button, "Manual" button, pipeline step, setup check and
  final-review checklist row, so a later change cannot silently swap or
  resize one (D-861).
- **New colors in code must come from the theme.** A third ratchet test,
  next to the file- and function-size ones, counts the colors written straight
  into the frontend code (Tailwind palette classes like `text-red-400` or
  `text-white`, hex and rgb/oklch literals, and named colors in a style
  such as `color: 'white'`). A new file must have none, a file
  on the list cannot gain any, and when one loses some its ceiling goes down.
  What draws the video itself (the stage, the short's caption and hook
  previews, the scene-type palette, overlays on the video) stays on the list
  on purpose (D-849).
- **Plain background, and the theme ramp moves out of the top bar.** The
  radial glows behind the content (red, amber/teal and blue, in all five
  themes) are gone: they competed with the status colors, so color now only
  appears where it means something. The top bar keeps just the light/dark
  button; the five themes and the accent palettes stay in Configurações →
  Aplicação → Aparência (D-846).
- **"Where I am" is neutral; red is for actions.** The active item in the
  rail, the current phase of the live, the selected tab, filter and cut used
  the same red as "Nova live" and as delete, so nothing stood out. They now
  use the neutral ink (new `--sel-*` tokens); the accent is left for what you
  press (D-847).
- **States speak one language.** The status badge already said "amber = it
  needs you, blue = it is in progress", but downloading, transcribing and
  publishing (the machine at work) came out amber, and an older status chip
  painted "aprovado" and the 6–8 short score in the button red. Those now
  follow the badge: machine work is blue, the mid score is blue, and the old
  chip is gone. Loose reds, ambers and greens in the cut evaluation, the
  scenes-out-of-cut alert, the audio sync button and the analysis audit now
  use one danger, one warning and one success tone that follow the theme
  (D-848).
- **R deletes the cut, after asking; A toggles.** In the editor and on the
  focused row of the live's cut list, A approves a proposed cut and sends an
  approved one back to proposed, and R now deletes the cut. Since D-746 R only
  sent it back to proposed, which A already did. Deleting removes the cut and
  its files for good, so R always opens the "Excluir de vez" confirmation first;
  on the list, focus moves to the next row afterwards, or back to the same
  row if you cancel (D-842).
- **The metadata window is organized by what each part produces.** YouTube
  texts (title, description, tags) on the left; covers on the right, with the
  cover text on top and one tab per cover (YouTube 16:9, TikTok 9:16), each in
  work order: preview, prompt, image. "Generate in ChatGPT" is now there for
  the YouTube cover too, and title and cover suggestions start collapsed. The
  ChatGPT robot closes its tab once the image arrives and keeps it open on
  errors (D-821).
- **One required check for `main`: "CI ok".** Branch protection used to list
  every CI job by name, so when Node 20 left the matrix no pull request could
  merge. A single job now waits for all the others, and a test fails when a
  new job is left out of it (D-820).
- **No pull request merges without a recorded audit.** A cloud session opens
  the pull request and stops there, because the audit skills live on the
  maintainer's PC. The `pr-audit` report goes into the pull request as a
  comment that ends with the audited commit's SHA, and the new required check
  "Auditoria registrada" only turns green for the owner's comment on the
  current head: any later push asks for a new audit (D-838).
- **Every change comes with a test.** The rule used to ask for tests only for
  new domain/service code and for bug fixes, so screen changes, refactors and
  migrations went in guarded by type checks and a look in the browser, and a
  requested function could go missing unnoticed. Now each item of a request
  gets the test that covers it, and the pull request template asks for a
  "Pedido → teste" table; an item without a test is listed as missing. A test
  keeps the rule written in AGENTS.md, CONTRIBUTING and the per-folder rules
  (D-860).
- **`bin\release.ps1` works in two steps, with the pull request in between.**
  `main` only takes pull requests now, so the version goes up on a
  `release-vX.Y.Z` branch; after the merge, `-Taguear` finds the release
  commit on `main` and creates the tag only when CI is green on that exact
  commit (D-823).

### Fixed
- **J and K go the same way on every screen that switches cuts: J is the
  previous cut, K the next.** The editor already worked that way, but the app frame (Metadados,
  Pós), the top switcher and the Workspace list went the other way, and the
  editor's own switcher read "Próximo item · J" while J went back. The
  switcher (its tooltip and the shortcut it announces to screen readers),
  the frame and the list now follow the editor; in the Workspace J
  moves up the list and K down (D-865).
- **"Publish on its own" finishes on TikTok.** Most of the time TikTok answers
  the Publish click with a "Publicar agora" (Post now) dialog, and the robot
  waited two minutes for a page change that only that second click brings,
  then reported the step as failed. It now confirms the dialog; the proof of
  publishing is still the tab leaving the upload page (D-873).
- **The TikTok and Instagram robot opens Edge, not Chrome, by default.** A
  channel that never chose a browser now gets Edge (Chrome when Edge is not
  installed); Chrome is still a choice in Settings. The first time, log in
  once in the Edge window (D-873).
- **The TikTok publish modal test no longer times out on a busy machine.**
  The test loaded the modal inside the test case, so building its whole
  import tree (~0.5 s, 95% of the case) ran under the 5 s limit and blew it
  when the full suite shared the CPU. The modal is now loaded with the test
  file, and the modal and its batch panel take the cache key from the light
  module instead of the project page's hook, which pulled eleven more
  modules; a test fails if they go back to the heavy import (D-874).
- **A Remotion upgrade in the lockfile always rebuilds the bundle.** The bundle
  cache told "something changed" by each file's size and date, and on Windows
  two writes in a row can share the same timestamp: `4.0.502` → `4.0.503` has
  the same size, so the old bundle kept running with the new Remotion. The
  small files (renderer code and the root configs) are now compared by
  content; only `public/` (~160 MB) still goes by size and date (D-863).
- **The editor's main button says the truth on a processed cut.** On a cut
  already rendered (processado), the button said "Approve cut", but clicking
  it — or pressing Enter — un-approves, as on any approved cut, sending it
  back to proposed. It now says "Approved", so the click does what the label
  says. The label, the click and the Workspace's A key share one approval
  rule (D-864).
- **The Library card shows the right icon for "Bruto" and "Publicação".** The
  card's six-step strip looks up each icon by the step's label, but its map
  still said "Cortes" and "Publicado", so those two steps fell back to the
  generic dashed circle instead of the scissors and the rocket. A test now
  checks that the map and the labels agree (D-851).
- **The short's overlay no longer rebuilds the renderer bundle on every
  render.** It rendered straight from `src/index.ts`, so each render (and each
  retry) ran webpack inside the same process that was launching Chrome. Under
  load, the 25 s browser timeout fired while webpack held the process, and the
  overlay died at 4m20s with "Timed out … while trying to connect to the
  browser". It now uses the cached bundle the cut render already uses, rebuilt
  only when `video-renderer/src` changes (D-845).
- **Shorts wait their turn instead of all rendering at once.** Every click
  started its own render with no limit, competing with the cut renders, so
  shorts died with "Worker não respondeu … em 900s" without ever starting,
  or lost the overlay when Remotion's Chrome took more than 25 s to open.
  Shorts now share the cut render slots (two by default, the second only
  with enough free RAM), and the short's panel says it is queued and why.
  A job's timeout now counts only while it runs; the wait in the worker
  queue has its own limit, `RENDER_ESPERA_NA_FILA_MAX_SEG` (4 h by default).
  The overlay step retries like the cut overlays (D-843).
- **Dark themes no longer show light panels, and faded colors show up again.**
  The older color scales (`bg-bg-900`, `text-text-100`…) froze the light
  theme's values before the shell theme applied, so in Escuro and Ardósia
  about 106 classes painted white panels with dark ink (Análise IA,
  Auditoria, Prompt manual). And every color with an opacity modifier
  (`border-error/30`, `bg-[var(--wb-accent)]/10`, `bg-bg-900/40`…) produced
  no CSS at all: 66 borders, tints and highlights were simply missing. Text
  on a filled accent or status color now follows the theme instead of being
  fixed white, the old theme provider is gone, and "Onde eu estava" no
  longer records "Página não encontrada" (D-841).
- **Shorts render again.** Every short failed at once on the overlay step
  with `spawn node.exe ENOENT`. Node was there: Windows reports a missing
  working folder as the program being missing. When the short renderer moved
  into `services/render/` (D-707), the folder it counted its way up to became
  `backend/video-renderer`, which does not exist. It now reads the renderer
  folder from the settings, like the cut render already did (D-837).
- **The second video of a TikTok batch no longer freezes mid-upload.** The
  watch over the previous tab slept outside Playwright while connected to the
  robot's Chrome; asleep, it stopped reading its driver, and the workers of the
  next tab stayed paused, so the upload stopped (42% in production). The watch
  now waits through the page. Measured with Chrome and two clients: frozen
  while sleeping, fine waiting through the page (D-833).
- **Buttons in the new shell show the colors they declare.** A form reset gave
  every button the inherited text color, overriding the component's own: the
  chosen title/cover suggestion came out dark on the dark accent, at 3:1. The
  reset now only sets the default, so the chosen chip is light on the accent
  (D-821).
- **Speaker diarization installs without version conflicts.** Installed on
  its own, `pyannote.audio` pulled OpenTelemetry versions that clashed with
  the backend lock. It now has its own lock, compiled against the main one and
  seeded with the versions already known to work:
  `bin\bootstrap.ps1 -Diarizacao` (D-819).
- **The YouTube re-authorization script runs again.** `dev-utils/auth_youtube.py`,
  the one the backend tells you to run when the token is missing or lacks the
  analytics scope, still imported the channel paths from their old place and
  died with `ModuleNotFoundError`, so no token could be generated for upload
  (D-835).

### Removed
- **Dead project-status code that called work in progress a warning.**
  The old card's top band (`faixaClass`, with its icon and spin flag) and the
  `PipelineProgress` component with its `rotuloDeEstado` label were no longer
  rendered anywhere, yet they still colored downloading, transcribing
  and publishing as a warning — the opposite of the status vocabulary, where a
  warning invites an action and work in progress is info. The Library card
  keeps reading the same state and the same six-step ribbon (D-850).
- **The old cut status strip.** `StatusPills` and `StatusPipStrip`, styled on
  the old `--wb-*` tokens, were no longer rendered on any screen; only their
  test imported them. The rule they wrapped, `buildStatusPills`, stays: it is
  what the cut card's ribbon reads (D-862).

### Security
- **The CI npm audit accepts only dated exceptions.** GHSA-vfj7-8cjw-p6xm
  (`braces`, high) has no fixed version and failed every PR; it comes in
  through Tailwind 3, which only reads its own config globs at build time.
  `bin/npm_audit_gate.py` now runs the audit and still fails on any high or
  critical advisory, except the GHSAs it lists with a reason and a review
  date (this one until 2027-01-03); an expired exception fails again (D-872).
- **React Router 7.18.** Closes the two open advisories on React Router 6: an
  open redirect through a backslash in `<Link>` and `useNavigate`, and a
  constructor injection in server-side hydration (not used by the app, closed
  anyway). Routes and imports did not change (D-818).
- **Lightning 2.6.6 in the speaker diarization lock.** Closes CVE-2026-58659:
  a tampered model checkpoint could run code on load, even with
  `weights_only=True`. It comes in through `pyannote.audio`; only `lightning`
  and `pytorch-lightning` changed, the lock is still compiled against the main
  one. Reinstall with `bin\bootstrap.ps1 -Diarizacao` (D-836).

## [0.5.0] - 2026-09-28

### Added
- **Generate covers in your own ChatGPT, without copy and paste.** A
  "Gerar no ChatGPT" button on the YouTube thumbnail (16:9), the TikTok art
  (4:5) and the Short cover (9:16) drives the operator's Edge: it opens a new
  chat in the channel's ChatGPT project, attaches the mascot sheets, pastes
  the prompt, waits for the image and sends it through the same upload as
  Ctrl+V, so frames and cover assembly still apply. It uses the ChatGPT
  subscription, not the paid API. The project link and the sheets are set per
  channel in Canais → Capas no ChatGPT (D-804).
- **Reels through the official Instagram API.** With `INSTAGRAM_ACCESS_TOKEN`
  in the backend `.env` (an Instagram-login token from a Meta app in development
  mode, with the channel as Instagram Tester — no App Review, no Facebook Page),
  the Reels destination uploads from disk, waits for Meta to process and
  publishes, with no browser. The cover goes through a link that expires in one
  hour, because the API only accepts a public cover URL; a cover that cannot be
  uploaded holds the Reel back (RN-26). The API cannot schedule, so a Reel with
  a date is refused instead of being published early. The token is copied to
  the channel folder and renewed every 30 days (D-802).
- **Upload every cut to TikTok at once.** The TikTok dialog of a project now
  has "Subir todos": the robot uploads the chosen cuts one after another in the
  operator's Chrome, without waiting for each one to be published before
  starting the next. At the end the window comes back with one ready tab per
  cut. With "publicar sozinho" it also presses Publish — but only on cuts whose
  cover was confirmed (RN-26). The same no-wait lane applies to the shorts
  batch (D-799).
- **A size gate for source files.** A test now fails when a code file in the
  backend, frontend or renderer goes over 500 lines. The 61 files that were
  already over the limit are listed with today's size as a ceiling; the list
  can only shrink. The old check asked the agent to judge size by itself and
  never caught a single file (D-771).
- **A size gate for functions.** Python functions are measured by cyclomatic
  complexity (limit 10) and statement count (limit 40); frontend functions,
  React components included, by lines (limit 100). What was already over the
  limit is listed per function with today's measure as a ceiling — 39 entries
  for 28 Python functions (a function can break both rules) and 121 frontend
  functions — and the lists can only shrink (D-772).
- **Type checking for the backend.** Pyright (the engine behind VS Code's
  Pylance) now checks `backend/app` in basic mode. The 175 type errors that
  already existed are counted per file and rule; a new one fails the build,
  and the counts can only go down (D-773).
- **`bin\release.ps1` prepares a release in one command.** It refuses a dirty
  tree, a branch other than `main`, an existing tag or an empty
  `[Unreleased]`; checks the requested version against the one the changelog
  categories call for; runs the full quality gate; bumps every copy of the
  version; closes `[Unreleased]`; and creates the release commit and the
  annotated tag. It never pushes: it ends by printing the publishing steps —
  push `main`, wait for green CI on that exact commit, then push the tag
  (D-782).
- **Shorts on demand, grouped by live.** The Shorts screen now groups cuts by
  the live they came from. Each cut has a "Gerar shorts com IA" button (it
  rebuilds a missing raw clip first), and each live has one button that
  downloads a cleaned-up live again, rebuilds the missing raw clips and asks
  the AI for shorts, one cut at a time. Until now the automatic step only ran
  when a raw clip finished rendering, so a Fire marked later, a cut flagged by
  hand, or a failed AI call was left without shorts (D-803).

### Changed
- **Generating shorts again adds to the queue instead of replacing it.**
  Pending AI suggestions are no longer deleted; a new suggestion that overlaps
  an existing candidate is dropped and listed in `descartes` (RN-26, D-803).
- **Node.js 24 is now the minimum.** Node 20 reached end of life on
  2026-04-30 and no longer gets security fixes; the bootstrap refuses it and
  points to the Node 24 LTS download. Production already runs 24 (D-781).
- **CI also runs weekly and on demand.** Besides every push, the full CI runs
  every Monday on `main` and from the Actions tab, to catch a dependency
  release that breaks the build without any code change (D-781).

### Fixed
- **Rebuilding a Fire's raw clip from the Shorts screen no longer calls the AI
  twice.** The raw clip step already suggests shorts for a Fire; the manual
  path now skips its own call when that step succeeded (D-803).
- **The cut's metadata modal edits again.** Opened from the cut list, it had
  become read-only in 0.4.0; it now offers the same actions as the metadata
  screen — generating and picking titles, the cover prompt, images (D-767).
- **The next-cut marker is back on the editor timeline.** It stopped showing
  in 0.4.0 because the position was no longer passed down to the timeline
  (D-768).
- **Clicking a queue row shows each run again.** The queue drawer and the
  `/fila` page expand a row into the state, timings, error and timeline of
  every run of that item, as the old modal did before 0.4.0 (D-769).
- **The assisted upload no longer shows a blank page when nobody is looking.**
  Chrome stopped drawing the TikTok/Instagram page whenever its window was fully
  covered (Windows occlusion), so the robot waited for buttons that never
  appeared. The robot's Chrome now starts with occlusion disabled, off screen,
  and gives keyboard focus back to the window the operator was using. An old
  robot Chrome without these settings is restarted when no upload is pending
  (D-799).
- **The TikTok cover is retried and double-checked.** A cover that did not
  stick is tried a second time with the editor reopened, and the proof (the
  thumbnail changing) now waits a few seconds instead of reading once (D-799).

### Removed
- **Development skills are no longer vendored in the repository.** The seven
  coding skills (`clean-code`, `react-best-practices`, `remotion-best-practices`
  and others) and the script that mirrored them from `.claude/skills` to
  `.agents/skills` are gone: they are about how to write code, not about the
  app, and now live in the maintainer's global skills. The per-folder rules in
  `.claude/rules` and `.agents/rules` keep the essentials of each scope and
  work without any skill installed. The app's editorial skills were already
  per channel, in the database, and are untouched (D-775).

### Security
- **Another website can no longer make the app do heavy work.** Pages open in
  the same browser could embed `<img>` or `<audio>` pointing at the local API;
  those requests carry no `Origin`, so the local-origin guard let them
  through, and some reads start ffmpeg. The guard now refuses what the
  browser marks as coming from another site (`Sec-Fetch-Site: cross-site`)
  unless its `Origin` or `Referer` is local. The app itself, scripts and the
  render worker are unaffected (D-814).
- **Uploaded covers must be images, and YouTube hosts are matched exactly.**
  A manual cover upload kept whatever extension the file name had (`.hta`,
  `.html`); only jpg, jpeg, png and webp pass now. The video-id extractor
  accepted any host ending in `youtube.com`; it now requires the real host
  (D-812, D-813).
- **Two paths that could leave their folder are closed.** Selecting or
  editing a channel did not check the id from the URL, so `..\..` (a
  backslash is a path separator on Windows) could point the active channel
  outside `channels/`, and the next start would read its database and
  editorial prompts from there; a pointer already written that way is now
  ignored. The multi-version export used each filter name as a folder, so a
  "filter" holding a path created folders and wrote files anywhere; only the
  known filters pass now. The other 95 path alerts from CodeQL were checked
  one by one and do not hold — every id is a server-generated UUID looked up
  in the database before any path is built; the triage is in
  `docs/seguranca/triagem-codeql-2026-09.md` (D-811).
- **Vite 6.4.3 and patched frontend/renderer packages.** The screen is served
  by Vite's server, and Vite 5 let Windows-specific alternate paths bypass
  the list of files it refuses to serve (`server.fs.deny`). Along with it,
  `vitest`, `react-router-dom`, `js-yaml`, `fast-uri`, `brace-expansion` and
  others move to fixed versions: high advisories go from 6 to 0 across both
  packages. Two moderate `react-router` advisories remain; their fix is
  React Router 7, a migration of its own. CI now fails on high advisories,
  not only critical ones (D-808).
- **A live's URL can no longer smuggle options into yt-dlp.** The URL went
  straight into yt-dlp's command line, so a "URL" such as `--exec=...` was read
  as an option — and `--exec` runs a command. The address is now checked
  (exact YouTube host, 11-character video id) when the project is created,
  and what reaches yt-dlp is rebuilt from the id, after a `--`. Pasted URLs
  without `https://` and bare video ids keep working. Found by CodeQL, which
  this release turns on (D-807).
- **Python dependencies are locked with hashes.** `requirements.txt` is now
  generated from `requirements.in` and pins the whole tree — 73 packages
  instead of the 23 listed by hand — with the hash of every file, for Windows
  and Linux. Two installs on different days get the same packages, and pip
  refuses a file whose hash does not match. A test fails when the environment
  running the tests drifts from the lock (D-796).
- **Every GitHub Action is pinned to a commit SHA.** The workflows used
  version tags (`@v7`), which the action's owner can move to other code;
  they now name the exact commit, with the version in a comment for
  Dependabot to update both together. A test fails when a workflow uses an
  action by tag again (D-780).
- **Workflows declare what their token may do.** CI and the lock check now
  read the code and nothing else; before, their token inherited the
  repository default, which can write. A test requires `permissions:` in
  every workflow (D-809).
- **Claude Code is denied the app's secrets.** The project's Claude Code
  settings deny reading and editing `.env`, `token.json`,
  `client_secrets.json` and the SQLite databases, and reading `~/.ssh` and
  `~/.aws`. It covers Claude Code's file tools and the shell commands it
  recognizes as reads; it does not cover every interpreter a script could
  run, nor other agents (Codex, Antigravity), which have their own settings.
  Before this, nothing stopped an agent from opening the operator's real
  YouTube OAuth credentials (D-770, D-800).

## [0.4.0] - 2026-09-27

233 commits since 0.3.0. This is a **structural release**: almost nothing new on
screen, a lot less that can break underneath. The backend's layers now point one
way, the frontend talks to the API through a generated client, the render
contract is written once, and the three UI shells became one.

### Added
- **AI through an API key.** Claude can now run through the Anthropic Messages
  API with the operator's own key, for installations without Claude Code or
  Antigravity. It is opt-in (`IA_CLAUDE_TRANSPORTE=api` in `backend/.env`); the
  default stays on the subscription CLI. Same queue, JSON contract and telemetry
  as the other transports (D-720).
- **Versioned contracts for the render worker.** The scene has one definition —
  the renderer's zod schema — shared by the preview, the render and the backend
  (as a generated JSON Schema checked by tests on both sides). Worker jobs carry
  a protocol version; a job the worker cannot run is answered with a clear error
  instead of failing inside the process (D-725).

### Changed
- **One UI shell.** The legacy and Workbench shells are gone; the new shell,
  already in production since 0.3.0, is the only one (ADR-0017, D-726 to D-728).
- **The frontend uses a client generated from the OpenAPI contract**, with typed
  requests and responses; hand-written fetches and duplicated types are gone
  (D-721 to D-723).
- **React 19.** The frontend moved to the renderer's React version (19.2.3), so
  scene previews run on the same React as the render (D-734).
- **Smaller downloads per update.** React, data access and Remotion ship in their
  own bundle chunks, so an app update only replaces the app's code; Remotion
  loads only on the post-production page (D-735).
- **The editor's player tick is cheaper.** Panels that do not depend on the
  playhead no longer re-render four times a second: React render per tick fell
  by about 45% in an A/B measurement (D-740).
- **Backend layers are enforced.** Domain rules live in `domain/`, external
  clients in `infrastructure/`, and import-linter contracts fail the build on a
  wrong-way import; the app has no import cycles left (E-051 to E-055).
- **Domain errors become HTTP responses by meaning**, through one global handler
  (D-697).
- **One schema-evolution path.** The `projetos.db` schema evolves only at boot:
  new columns come from the models, transformations from versioned migrations
  (D-701).

### Fixed
- **Cut layouts keep inheriting from the project and global defaults.** Saving a
  cut's layout wrote every default into it, so later changes to the project's
  stage stopped reaching that cut. Only the keys that changed are saved now
  (RN-10, D-741).
- **Downloads can no longer hang forever.** yt-dlp now stops after ten minutes
  without any output (the download itself may take hours) and the project shows
  the error; subtitles and live chat got overall time limits (D-753).
- **Live credit goes to the channel the live came from**, not to the publishing
  channel, when no source channel was typed (D-714).
- **Assisted upload no longer drives the other platform's Chrome.** When the
  TikTok and Instagram profiles hash to the same debugging port, a batch opening
  both at once could hand one robot the other's window. Chrome launches are now
  serialized, and a profile whose window had moved to the next port finds it
  again instead of trying to open a second Chrome over it (D-761).
- **FFmpeg helper honors its advertised timeout** (D-750), and the backend test
  suite no longer touches the developer's real databases (D-760).

### Removed
- The legacy and Workbench shells and their feature flags (`VITE_UPGRADE_SHELL`,
  `VITE_WORKBENCH`); rollback is now git (D-728).
- The `SettingsModal`, unreachable since the legacy sidebar left; preferences
  live in Settings → Application (D-724).

## [0.3.0] - 2026-09-22

564 commits since 0.2.0. The headline is **vertical shorts end to end** and a
**redesigned workbench**; the release also makes the app installable by someone
other than its author.

### Added
- **Shorts, from candidate to published post.** The AI proposes short candidates
  over the raw cut's transcript (D-454), you curate them (D-459), trim by frame
  or typed timecode (D-478, D-482), and the render runs in two stages — preview
  then finalization — with progress and worker log on screen (D-483, D-485,
  D-568). A short can be built from several segments of the raw cut (D-604).
- **Stage composition instead of cropping.** The 9:16 frame is recomposed on a
  *palco*: named crop regions placed into slots, with the channel's texture and
  chrome, editable live on the preview and reusable as presets (D-486 to D-509,
  D-559, D-561, D-562). The cut carries a default stage that its shorts inherit
  live (D-570). Face-aware framing picks the speaker (D-464, D-477).
- **Burned-in captions and an opening hook.** TikTok-style animated captions with
  font, highlight color and vertical position chosen before the render (D-462,
  D-563, D-605), plus a 4–7-word opening hook card that can be dragged and
  resized on the frame, generated by an editable channel skill (D-565, D-600).
- **Publishing to three platforms.** YouTube through the official API; TikTok and
  Instagram Reels through **assisted** upload that drives your own Chrome and
  stops before the publish button (experimental — see
  [ADR-0009](docs/adr/0009-publicacao-assistida-experimental.md)). Batch publish
  runs platform by platform (D-564), with scheduling (D-580), re-publish (D-590),
  manual "already published" marking (D-603) and upload percentage in the log.
- **Covers.** TikTok and short covers are built from a frame of the video, with
  AI art on a middle band, a label written by a channel skill, the channel frame,
  and a layout editor in Configurações (D-519 to D-556, D-586).
- **A redesigned workbench (D-386 to D-402, D-599, D-610, D-746).** New shell
  with tab rail, global queue, collapsible panels, five themes and an accent
  color; Library remembers filter and order; cut cards show stage and status;
  ⌘K finds cuts and shorts; keyboard-first triage. Editable shortcuts for every
  action (D-394) and a Shortcuts page (D-393).
- **Editorial v2 for cut analysis (D-302).** Cuts are proposed as self-sufficient
  stories — strongest-entry-point hook, opening contextualization, priority
  score, 5/8–18/30-minute bands, diarization-aware rules, 55–60-character titles
  — and the trechos skill becomes a cohesion editor that may revise desvios.
- **Editorial telemetry (D-303, D-353, E-022).** The AI proposal is frozen as an
  immutable snapshot; an Analytics area compares proposal vs. final cut per
  project and across projects, and every LLM call is recorded.
- **Per-channel editorial skills in the database, with UI (E-021, D-297, D-312).**
  Five skills plus prompts and scaffolds live per channel, versioned append-only
  with revert and audit — not in `.claude/skills`.
- **A second AI provider.** Gemini through the Antigravity CLI (`agy`), on your
  own subscription, selectable per step with a badge saying who generated what,
  plus a manual mode ([ADR-0004](docs/adr/0004-provedores-de-ia-v2.md)).
- **Speaker diarization (D-286, D-296, D-360)** labelling channel vs. guests, and
  local ASR transcription of the raw cut (D-461).
- **Onboarding for a new install.** `bin/bootstrap.ps1` (D-630), a Prerequisites
  card that says what the machine is missing and what each optional tool unlocks
  (D-627), an in-app YouTube OAuth walkthrough (D-628), and a rewritten
  [README](README.md) and [SETUP](docs/SETUP.md).
- **Versioned HTTP contract** in `backend/openapi.json` with a drift test (D-664),
  **domain-owned lifecycles** for Projeto and Corte (D-665), and a documented
  domain: [context map](docs/dominio/mapa-de-contextos.md),
  [glossary](docs/dominio/glossario.md) and
  [business rules RN-01..RN-25](docs/dominio/regras-de-negocio.md) (D-667).
- **Fourteen ADRs** recording the decisions behind this release (D-673).

### Changed
- **Render is faster and bounded.** Pre-composed stage backgrounds cut grade time
  by ~16% (D-415); two render slots run with RAM back-pressure (D-441); the final
  encoder is chosen in Configurações and falls back to `libx264` without an Intel
  iGPU (D-622). Remotion loads only the fonts of the preset in use (D-642), and
  the bundle fingerprint includes the lockfile (D-643).
- **The project list endpoint is ~4x faster** and no longer churns memory (D-431):
  deferring the transcript column drops the query from 1649ms to 250ms and the
  per-request peak from 80.2 MB to 0.6 MB.
- **No more 30% ceiling on removed desvios** — removal is governed by a semantic
  guardrail and watched by telemetry (D-302).
- **Configuration moved into the database, per channel** (identity, theme,
  mascot, ranking weights, skills), editable on screen
  ([ADR-0012](docs/adr/0012-onde-vive-cada-configuracao.md)).
- **Windows is the only supported platform**
  ([ADR-0008](docs/adr/0008-plataforma-windows.md)); CI now runs a
  `windows-latest` job with bootstrap, clean boot and pytest (D-688), plus a
  Python 3.11/3.13 and Node 20/24 matrix (D-687).
- **Guard-rails that fail the build:** import-linter layer contracts (D-662),
  ESLint folder boundaries (D-663), the OpenAPI drift test (D-664), a mojibake
  test (D-668), a single-version check (D-686) and a commit-message check in the
  hook and in CI (D-684).
- **One version for the whole app**, sourced from `VERSION` (D-686), and
  `AGENTS.md` as the single source of instructions for AI agents (D-672).

### Fixed
- Missing model columns in an existing database no longer break the API (D-403):
  boot reconciles the declarative schema before running the versioned migrations.
- Cut ordering, splitting and joining preserve work already done (D-575, D-576).
- Layout inheritance stays partial: a missing key means inherit, and defaults are
  materialized on read, never on write (RN-10).
- The renderer's browser download no longer aborts `dev.ps1` on a fresh install
  (D-671).
- Dozens of fixes across the shorts pipeline, stage, captions, covers and
  assisted upload — the areas this release exercises most.

### Removed
- Docker, `docker-compose.yml` and `bin/deploy` (D-674): they described the
  pre-multichannel data layout and never brought up the worker or the frontend.
- The `editado` cut status (D-665) and the legacy `/export` route.
- n8n as the AI path (D-344), dead Shorts v1 code (D-345), LosslessCut and
  auto-editor with their orphan endpoints (D-346, D-347).

### Security
- **The local API only answers this machine** (D-745). The backend listens on
  `127.0.0.1`, CORS allows local origins only, and a guard refuses
  state-changing requests, WebSockets and foreign `Host` headers (DNS
  rebinding). Before this, any page open in your browser could reach the API —
  which has no login. See [SECURITY.md](SECURITY.md).
- Private vulnerability reporting enabled, and a documented secret surface
  (D-675).

## [0.2.0] - 2026-07-06

### Added
- Configurações page: edit the channel identity, global render settings, and
  the mascot name directly from the app — configuration moved from files to a
  per-channel database with file mirror/fallback and boot migration (D-191, D-285).
- Update guard-rail now warns about **any** locally-modified tracked file before
  a production update, highlighting code outside `instance/` (D-178).

### Changed
- Internal: sliced seven oversized modules (>1300 lines) into cohesive
  sub-modules/sub-components following SRP, with the public façade preserved so
  behavior is unchanged — `ffmpeg_commands`, `pipeline_render`, `export`,
  `routers/cortes`, `CenaOverlay`, `YoutubeLayoutPanel`, `PostProductionPage` (E-006).
- Genericized residual mascot naming in renderer comments (D-259).

### Housekeeping
- The Guia Fluxo state (`.guia/`) is now developer-only; only `.guia/locks/`
  remains versioned (required by CI). The auditable action log is the git
  history itself (D-276).

## [0.1.0] - 2026-07-04

First public release.

### Added
- Core pipeline: YouTube livestream → download → transcribe → AI-proposed
  cuts → review/approve → metadata/thumbnails → export for YouTube.
- Layered final-render pipeline: cinematic grade via Intel QSV (FFmpeg) →
  selective transparent overlays (Remotion) → single-pass composition/encode.
- Segmented grade rendering in a memory-safe subprocess with freed threads (D-065).
- Per-cut and per-segment fine audio sync (offset) with live preview (F-063).
- Waveform/proxy warmup when a project is opened (F-062).
- Thumbnail prompt evaluation history to drive visual variation (D-066).
- Metadata access from the T / image icons in the cuts sidebar (D-068).
- "Not published" filter on the projects screen (F-059).
- Manual cut creation and YouTube URL parsing for manual publishing.
- Local image bank fallback for biography cards when the API has no match.

### Changed
- Render layered pipeline now runs the Remotion bundle in parallel with the
  GPU grade step, with a job-category worker queue.
- Skill routing reorganized by scope under `.guia/` (D-073).
- Process layout migrated to `.guia/`; the legacy `ai-process` pack was removed.

### Fixed
- Thumbnail headline no longer clips the title text (D-074).
- Exponential backoff for Claude CLI `529 Overloaded` responses (D-072).
- Cut generation uses the signed-in Claude session instead of the API key (D-071).
- Overlay chunks now use chunk-relative timing, fixing delayed/blank `.webm`
  chunks (see `docs/interno/historico-arquitetura-2026-05.md` §8).
- Single-flight audio proxy with hybrid seek (I-039).

[Unreleased]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Paulo-Marcos/gerador-cortes/releases/tag/v0.1.0
