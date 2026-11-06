# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Architectural deep-dives that predate this file are preserved as historical
> narrative in [`docs/interno/historico-arquitetura-2026-05.md`](docs/interno/historico-arquitetura-2026-05.md). New changes are tracked
> here in the standardized Keep a Changelog format.

## [Unreleased]

## [0.7.0] - 2026-11-06

### Added
- **Spread a batch of shorts across the channel's audience window.** The
  batch modal gains a third "when": besides "now" and "one date for all",
  "distribute across the channel window" places every item in the publishing
  blocks of each network, fills a day and moves to the next, starting after the
  last item already scheduled on that network. The computed agenda shows up in
  the modal before you click — short, network, day and time, with how strong
  the audience is at that hour — and any line can be adjusted on its own
  without recomputing the rest. Items that fall outside a platform's scheduling
  horizon (TikTok: 10 days) stay without a date and are skipped with the
  reason. Channels → "Horários de publicação" holds the audience reference
  (a 7 × 24 grid you copy from Studio's "When your viewers are on YouTube")
  and, per network, the blocks, items per block, daily cap, minimum gap and
  active days, each with a default and a reset. Instagram Reels stays out: the
  web composer does not schedule — not even emulating a phone, where it does
  not accept video (measured 2026-10-13) — so it publishes on the spot (D-908).
- **A long cut opens with the chat question it answers — or with a bridge to
  the live.** When the presenter is reading or answering a chat message at the
  start of a cut, the first scene is a card that looks like the YouTube live
  chat: round avatar, the author's name and the message exactly as typed
  (typos, @mentions and unicode emoji kept; channel-only emoji dropped). The
  app picks up to three candidates from the downloaded chat replay (messages
  with "?" in the 15 minutes before the cut whose words he repeats in its
  first 90 seconds) and the scenes AI only says which one, or none. Without a
  chosen question, the cut's `contextualizacao` now actually reaches the
  scenes prompt as the opening bridge — no scenes scaffold carried it before.
  The two are exclusive: with a question, no other scene starts before the
  card leaves. The avatar is downloaded into the cut's folder; if it fails,
  the card draws the name's initial. Shorts are out of scope (their scenes are
  off since D-560) (D-910).
- **Covers can star the live host instead of the mascot.** Canais gains an
  "Estilo das capas" section: pick the protagonist (mascot or host, never
  both), keep a bank of host photos where the file name is the expression
  (`pensativo.jpg`, `indignado-2.png`), and set the brightness goal. In host
  mode the three cover prompts open with a `MODO DA CAPA: apresentador` block
  listing the available expressions; the cover writer answers with an
  `[APRESENTADOR="..."]` line, and the ChatGPT robot attaches up to three
  matching photos (the rest picked deterministically from the prompt) instead
  of the mascot sheets. Switching back to the mascot loses nothing (D-909).
- **Dark covers get flagged.** Each YouTube cover is measured (mean luminance
  and share of pixels below 50) against the channel goal, 95 and 40% by
  default, and the cover tab shows a discreet warning with the numbers when it
  falls short (D-909).
- **Choose where the cards sit on the shared stage.** The positioning modal
  gains a "Cards" rectangle next to the crops and slots. It starts on
  "Automática" (the rule as before: left of the big screen, above the small
  one), and "Manual" pins that rectangle so you can drag it to any column of
  the stage and set its width and height; cards shrink to fit it. The choice
  lives with the layout, so it cascades (global → project → cut → segment) and
  travels with positioning presets; leaving it on Automática keeps inheriting
  (D-904).
- **The Shorts list shows where each cut already is.** Every Fire card carries
  three chips, YouTube, TikTok and Instagram, lit only when all the rendered
  shorts of that cut are confirmed on that network and dimmed otherwise, with
  the count on hover. It answers "can I finalize this one?" from the list,
  without opening the workspace to check short by short (D-905).
- **The YouTube Studio robot turns monetization on and links each short to
  its cut.** The YouTube API uploads with monetization off (the Studio upload
  defaults only apply to browser uploads) and cannot set a Short's "related
  video". Two switches under Ajustes → "Robô do YouTube Studio", per channel
  and off by default, hand both to a robot: every cut or short the app uploads
  goes into a queue, and after the uploads it opens the Studio once and fixes
  them all. A short is linked to the cut it came from, only when that cut is
  already on YouTube. Log in to the channel in the robot's window the first
  time (D-895).
- **A default hook look for the whole channel.** Next to the "gancho" selector
  of a Fire, the star button makes the chosen preset the channel default
  ("padrão do canal"). Every clip that does not pick its own hook preset now
  follows it — the empty option reads "padrão do canal (Name)" — and changing
  it changes every clip that follows, since nothing is copied. A clip can still
  pick another preset; deleting the default preset clears it (D-901).
- **A "clean" stage style, with a channel header you can customize.** Canais
  gains a "Palco do canal" section: pick the stage style ("Atual", the chamfered
  chrome as before, or "Limpo", a flat graphite background with rounded video
  windows and no lines or brackets), switch the channel header (image + name +
  @) and the speaker plate on or off, override the name and handle, and upload
  the image shown next to the @ (the mascot's "apresentador" pose until you do).
  It applies to the horizontal stage and to the shorts' stage of the active
  channel on the next render; the cut's own window geometry is untouched, and
  the editor preview and the shorts preview draw the same stage. The clean
  style has its own background, a halftone dot pattern in the lower-left and
  upper-right corners over a coral-to-petrol glow (or plain halftone, glow,
  linen, flat), and on shorts the windows sit inside a thin contour of that
  background instead of touching the frame edges. Every fixed component says
  where it sits and how big it is: the header's size and position (video and
  short), the plate's size and position (automatic or fixed), and the short's
  contour width (0 turns it off). On shorts with the screen inset over the
  person, the inset's corners are rounded too. The uploaded header image must
  be a real image up to 10 MB, and the stage is edited on the active channel
  only (D-911).
- **A cleaner short: video "echo" around the windows, a shadow-only caption
  and a highlighted word in the hook.** The channel's stage settings (Canais)
  gain two choices for shorts. "Em volta das janelas" can show the stage
  background, as before, or the echo: the main window blurred, desaturated and
  darkened in the bands around the windows, so the frame looks like it comes
  from the video itself (clean style only; each window keeps its contour and
  rounded corners). "Legenda" can keep the outline, as before, or switch to a
  soft shadow with no black border around the letters. In the hook, write the
  word or phrase to highlight between asterisks (`*Game of Thrones*`) and it is
  drawn in the channel accent; the cover and metadata prompts get the text
  without the asterisks. The shorts preview shows all three as the render
  does (D-913).
- **Scenes in the clean style, and cards each channel can tune.** When the
  channel's stage is set to "Limpo", every scene type is drawn as a single
  Block from the design catalog: a 6 px accent stroke, a small uppercase
  kicker, the title, the body and a footer — no box, no HUD, no forced caps,
  and the mascot only on the closing call. Over the full video the card gets a
  local scrim that follows the scene's shadow level; on the shared stage it
  sits on the graphite with none. The comparison, list, timeline, source,
  lower bar, thesis, closing call and chat question get their catalog shapes.
  In Canais → "Cards (cenas)" the channel picks which scene types appear in
  the video (in any style), the card size, and where cards sit over the full
  video; on the shared stage each cut's card zone still decides. The editor
  preview draws the same scenes (D-916).
- **Motion for the clean-style scenes.** In the clean style the accent stroke
  grows first (6 frames), then the text comes in line by line — each line
  rising 10 px over 6 frames, 4 frames apart — and everything leaves in the
  last 6 frames; the scrim fades in and out with the text. The highlighted
  number counts up to its value (only when it has a single numeric core, so
  "1 em 1 milhão" stays as written), the emphasis underline draws itself, and
  two scenes of the same family less than 0.25 s apart keep the stroke and
  swap only the text. The lower bar never stays on screen for more than 4 s.
  The current style does not change (D-918).
- **See what changed, in Portuguese, inside the app.** A "Novidades" item
  under Ferramentas (and in the ⌘K palette) lists every version from this
  CHANGELOG — the newest first, starting with what is already on main without
  a number. The AI of your subscription rewrites each entry for the operator:
  a Portuguese title, what changed and, when there is something to do, a "Como
  usar" with where it lives in the app and the steps. It translates by itself
  as each version is opened, eight entries at a time, and keeps the result, so
  each entry is translated once; until then the card shows the English
  original, which stays one click away. The rail item gets a dot when
  something arrived since your last visit, and those cards are marked "novo
  para você". On the first visit, everything that already has a version
  counts as seen (D-922).
- **Choose the AI models in one place.** Canais → Aplicação → "Modelos de IA"
  says which model answers each tier — heavy, medium and fast — for Claude and
  for Gemini (Antigravity), plus the text and image models of the Gemini API.
  Each picker lists what the provider offers on this machine (the `agy` list,
  the Gemini key's list, and the Claude aliases and ids) and saves by itself.
  The skills of the channel now pick only the tier, so when a model is retired
  you change it once instead of skill by skill; skills saved before keep their
  tier (opus → heavy, sonnet → medium, haiku → fast). Gemini 3.1 Pro left
  Antigravity, so the heavy and medium Gemini tiers now default to
  `gemini-3.8-flash-high` (D-924).
- **Covers use frames of the cut as the host reference.** In host mode, the
  ChatGPT robot now takes frames from the cut's own video at the moment the host
  says the cover line (the YouTube thumbnail and TikTok art look for the cover
  text, the short art for its cover line or hook) and attaches them, cropped on
  the host and enlarged, instead of the photo bank. The request says the
  identity and the expression come from those frames, and the host's
  `EXPRESSION` line points to them. The host is found through the webcam marked
  in the cut layout and, without it, by who moves while the line is said. When
  the line is not found, the video is missing or no live face is in view, the
  robot falls back to the photo bank as before (D-929).
- **"Estilizar capa" on the TikTok cover.** A modal like the stage one: pick the
  cover style (follow the stage, current or clean), the clean background, show or
  hide each component (title, image, handle, and in the clean style the channel
  header and an accent stroke), drag them on a live preview drawn by the same
  composition that renders the PNG, and save named presets to reuse. The style
  is per channel; saving redoes the clip's cover (D-933).
- **Width and height for the card over the full video.** In the position modal,
  the card in full mode could only be moved: it was never selected, so its resize
  handle never showed. Now it shows, and stretching it turns the card into a box
  with its own width and height. With "fill the space" the text spreads across
  the box width, the size (%) becomes the font size, and whatever does not fit
  shrinks. "No box" goes back to position and scale. The panel also has width,
  height, X and Y fields (D-941).
- Na tela de Canais, o bloco "Capa do TikTok" ganhou o botão **Estilizar capa**: abre o mesmo modal da capa de um corte, sem precisar de um corte — a prévia vai sem a arte e com um texto de exemplo, e salvar grava o estilo do canal (D-947).
- A análise da live ganhou a opção 'As duas': roda o Claude e depois o Gemini, soma os cortes das duas (pulando quase-duplicatas) e avisa quantos cada uma trouxe; se uma falhar, a outra roda mesmo assim (D-977).
- **The robots check the logged-in account before every upload.** YouTube (cut
  and short), Instagram through the API, and the TikTok and Instagram browser
  robots now read which account is logged in and refuse to send when it is not
  the channel's account, saying which account they found and which one they
  expected. The first upload of each destination learns the account, so nothing
  stops after the update; from then on only that account passes. An account
  that cannot be read also blocks the upload. Canais → Aplicação gains "Conta de
  cada destino", listing the learned account of each destination with a
  "Esquecer" button for when you switch accounts on purpose: the next upload
  learns the new one.
- **The Biblioteca card says whether the live's horizontal cuts are already
  up.** Each project card now carries two network chips, YouTube and TikTok,
  next to the stage strip: lit when every cut with a finished video has gone
  up on that network, dimmed otherwise, with "N of M cuts ready" in the
  tooltip. "Finished video" is the same count the card already shows — the cut
  is on YouTube or its `video.mp4` is on disk — so a cut still waiting to be
  sent keeps the chip off. The TikTok chip reads the manual confirmation the
  operator gives on the project screen. A live with nothing ready yet shows no
  chips. Same reading as the network icons on the Shorts card, one height
  above: there the question is about a cut's shorts, here about the whole
  live (D-987).
- **Each cut on the project screen shows which AI proposed it.** A small
  icon next to the title marks the cuts proposed by Claude, by Gemini
  (Antigravity) or pasted by hand as JSON, with the name in the tooltip, so the
  operator can compare the quality of each provider at a glance. The origin
  comes from the proposal frozen when the analysis is imported (D-303); a cut
  created by hand, or older than that record, shows no icon. The cut API now
  returns it as `origem_analise` (D-988).
- **The editor workbench shows which AI proposed each cut.** The same icon from
  the project screen (Claude, Gemini or pasted by hand) now sits next to each
  cut in the "Cortes da live" side list and next to the open cut's title in the
  top bar, so the operator sees it while editing. Cuts with no recorded origin
  show no icon (D-991).
- **Deleting a cut the AI proposed now records why, and the proposal stays.**
  Deleting a cut used to orphan its frozen proposal (D-303): no project, no
  date, no reason. In D-989, 177 of the 570 cortador-expert proposals had been
  deleted, and finding which live each came from took reconstruction by time
  and text. The proposal snapshot now keeps the project, the moment it was
  deleted and an optional reason from a closed list (weak theme, repeats
  another cut, doesn't stand alone, off the channel's line, too short,
  audio/video problem). The "Excluir de vez" dialog, in the editor and on the
  project's cut list (R), offers those reasons as chips only for AI-proposed
  cuts; confirming without picking one still deletes at once. The project's
  editorial telemetry counts the deleted proposals by reason, including the
  ones left without a reason. Migration 009 drops the snapshot's foreign key to
  the cut (SQLite never enforced it here) by rebuilding the table from its own
  stored DDL, and fills in the project of every snapshot whose cut still
  exists; proposals deleted before this change stay without a project.
- **Each short the AI proposes now keeps its original proposal, frozen.**
  Cuts had a frozen copy of the AI's proposal (D-303); shorts did not. In
  D-989 the shorts-expert's edges, length and score could only be rebuilt from
  the AI call log by matching titles, which is how we learned the operator
  stretches 43 of 65 accepted shorts (median +13 s). Now every short born from
  the AI is saved next to a snapshot with its start, end, score, hook, title,
  provider and model, and nothing rewrites it: editing the edges, generating
  again or merging cuts only touches the short. The snapshot outlives the
  short: deleting the cut (which takes its shorts along) only stamps the moment
  it was deleted. The project's editorial telemetry gains a `shorts` section
  comparing proposal and final for each short (edge and length deltas, using
  the net length when the short is stitched, and whether the hook changed),
  plus the D-989 tally: how many accepted shorts were stretched or shortened,
  and the median change in length. The new table is created at boot; no
  migration was needed.
- **Each channel sets the duration range of its shorts on the Canais screen.**
  The shorts expert proposed candidates between 15 and 90 s, a range fixed in
  `config.py` and only changeable by deploy — against ADR-0012, which puts
  editable configuration in the channel's database. The telemetry of D-989
  showed the ceiling did not fit: 25 of the 28 shorts above 90 s were accepted
  by the operator. The new "Duração dos shorts" section on Canais reads and
  saves the range per channel (default still 15 to 90 s), the prompt and the
  discard of out-of-range candidates follow it, and a minimum equal to or above
  the maximum is refused by the domain, with the message shown on the screen.
- **Doubtful claims get a "conferir" alert instead of being cut.** The
  trechos-expert used to mark a doubtful fact (a number, a date, an author) as
  a removal of category `imprecisao`, and the operator undid 77% of them,
  because taking the sentence out took content with it. Now the skill can list
  those spans under a separate `conferir` key: the span stays in the cut, and
  the editor sees it as a hatched band on top of the timeline waveform plus a
  "Conferir" strip above it, with a button to jump to the span and one to mark
  it as checked. The alert lives in its own column of the cut and nothing that
  computes the cut (segments, net duration, final transcript, render) reads it.
  An `imprecisao` still proposed as a removal by an older skill becomes an
  alert too, and so does one pasted in the manual mode; a removal the editor
  marked by hand is never reclassified. Splitting a cut gives each half its own
  alerts, and joining two keeps the alerts of the one that is deleted. A
  checked alert stays recorded, so the next generation does not propose it
  again.
- **A cut can be deleted for more than one reason.** The reason chips in the
  "Excluir o corte de vez" dialog (D-993) were single choice, but a cut often
  leaves for two reasons at once — a weak theme that also repeats another cut.
  The chips are now multiple choice and still optional: none marked deletes at
  once, with no reason. The proposal snapshot keeps the list in the same
  field, as the slugs joined by "|" in the vocabulary's order; unknown slugs
  are dropped. Records saved with a single reason read as a one-item list, so
  no migration was needed. The editorial telemetry counts every reason marked:
  `total` still counts deleted proposals, while each reason adds one per
  deletion that marked it.
- **Each channel edits its own list of reasons for deleting a cut.** The
  reasons offered when deleting a cut the AI proposed (D-993, D-1005) were a
  fixed vocabulary in the code. They now live in the channel's settings
  database and are edited on the Channels screen, under "Motivos de excluir um
  corte": a new reason gets a stable slug derived from its name and shows up
  as a chip from then on, and hiding a reason takes it off the chips without
  touching history — cuts already deleted for it stay counted and named in the
  editorial telemetry. A channel that never edited the list keeps the six
  reasons of today. Deleting a cut accepts only the reasons the channel
  currently shows; a channel that hid them all no longer asks.
- **Instagram Reels can now be scheduled.** A batch with dates no longer posts
  every Reel at once: with the Instagram robot on, each Reel goes through the
  Meta Business Suite reels composer, which uploads it, sets the caption and
  cover, types the date and time, reads them back, and schedules. The account
  shown in the composer is learned and checked like every other destination,
  and the channel's publishing blocks now include Instagram Reels. A Reel with
  no date keeps going through instagram.com. The first run asks for one login
  to the Business Suite in the robot's window.
- **Each cut now has a technical report card on the Final Review.** With no AI,
  the app measures the final video (and each rendered short) in the background,
  after the render: integrated loudness, true peak and loudness range
  (`ebur128`), stretches where the picture froze (320x180 gray frames, at most 3
  pixels changing for 0.33 s or more, with the origin: the freeze came from the
  live, or showed up in the render) and the seams between the pieces of the raw
  cut (how many, how many have sound on both sides above -40 dBFS, and the
  sample step against the p99 of the cut's own speech). The card only warns and
  never blocks publishing; the -14 LUFS (±1) and -1 dBTP references are shown as
  a market convention, not a platform requirement. The result is saved next to
  the video and discarded when the file, or the pieces that made it, change. If
  the video was cleaned off the disk the card says so instead of failing. Audio
  and render are untouched.
- **Reviewing a cut no longer means listening to all of it.** Each trecho now shows
  the speech that leaves and how the join reads, right in the list. The AI has to
  quote what it removes: in 12 real cuts, 3.6% of quoted edges disagreed with the
  transcript, and the app kept them silently. Now a mark whose quote doesn't match
  stays out of the cut, struck through, with the reason. A mark with no quote still
  goes in, labeled as not checked.
- **Removing a trecho strikes it.** It stays visible and comes back with one click,
  and "Desfazer a rodada" strikes everything the last AI run marked, except what you
  adjusted by hand.
- **As cenas agora mostram de onde vem o que afirmam.** Na aprovação, cada cena traz a frase da fala, quem disse e a fonte, com aviso quando a citação não é literal, o número não está na frase ou o autor não é quem falou. O aviso nunca reescreve a cena. O rótulo "Dado" só aparece no card de número com fonte, e a cena acompanha a frase quando o corte muda.

### Changed
- **A long cover phrase no longer becomes the TikTok label.** The YouTube
  cover text is moving to the spoken sentence of the cut (10 to 18 words);
  inheriting it would squeeze half a sentence into the vertical shelf. Up to
  8 words it is still the label, as in D-533; above that the label comes from
  its own skill (D-909).
- **Batch publishing is followed in the queue drawer, not in a modal.** When
  you start a batch (YouTube Shorts, TikTok, Instagram Reels, the "Subir
  todos" of horizontal TikTok, or "Publicar em massa" on YouTube), the modal
  closes and the queue drawer opens. The batch sits at the top of the drawer,
  with one lane per platform, the "publiquei" and "saiu no ar" buttons and
  "cancel". The rail card counts it too ("Fila · lote, 1/6 publicados · 2 com
  você"), so the reference stays when you move to another project. A finished
  batch stays listed until you remove it (D-897).
- **"Gerar no ChatGPT" is now a queue item, and you can follow it in the
  Fila.** The click answers at once; the robot takes one cover at a time,
  saves the image in the right cover itself (YouTube thumbnail with frame,
  TikTok art, short cover) and shows its step in the Fila — "capa YouTube no
  ChatGPT", "arte TikTok no ChatGPT", "capa do short no ChatGPT" — with the
  timeline in the row detail. If it stops, the Fila and the button say where
  and why, even after you close and reopen the modal. A cover still waiting
  its turn can be cancelled from the Fila; one already being drawn keeps going
  (close the robot's tab to stop it). Before, the reason died with the modal
  and the robot's tab stayed open with no explanation (D-898, D-896).
- **"Gerar prompt" already asks the ChatGPT robot for the image.** Writing
  the YouTube thumbnail prompt puts the thumbnail in the ChatGPT queue, and
  the chained TikTok art prompt does the same for the art; the short's "Gerar
  prompt" does it for the short cover. No second click — "Gerar no ChatGPT"
  stays for asking another version. Redoing the prompt while the robot is
  still drawing is not lost: the newest prompt is drawn next. Nothing happens
  when the channel has no ChatGPT project set (D-899).
- **Cover and hook in one click from the shorts list.** Each approved clip
  card shows "Gerar capa com IA" (writes the short cover prompt; the robot
  draws it and saves it as the cover, with its step shown under the button)
  and, while the clip has no hook, "Gerar gancho" (the AI writes it with the
  clip's or the channel's default look; the other suggestions stay in the
  hook modal). The "Prontos" cards get the cover button too, and the short
  cover modal now opens on "Arte desenhada" instead of the video frame
  (D-900).
- **The release script compiles the changelog fragments.** Each demand now
  writes its own `changelog.d/<ID>.<category>.md` instead of editing
  `[Unreleased]`, so queued PRs no longer collide on the same lines.
  `bin/release.py` counts the fragments when suggesting the version level,
  merges them into `[Unreleased]` through the Guia engine and deletes them in
  the release commit. With fragments present, the release requires `GUIA_PY`
  (the path to the Guia `bin/guia.py`) and stops before the gate without it,
  instead of shipping without those entries (D-912).
- **Dependencies brought up to date, in a batch.** Remotion 4.0.534 in the
  frontend and the renderer (zod stays on 4.5.4, the version Remotion pins);
  sqlalchemy 2.1.4, google-api-python-client 2.201, google-genai 2.29 and
  ruff 0.16.10, with the Python locks regenerated from `requirements.in`;
  `actions/setup-node` 7.1 in CI. Versions published less than five days ago
  were left for the next batch (Remotion 4.0.535, google-genai 2.30). The major
  upgrades stay out, each with its own demand: Vite 8 (D-826), ESLint 10
  (D-825, D-765), lucide-react 1.x (D-831) and wavesurfer.js 8 (D-830)
  (D-914).
- **Faster CI.** The backend and Windows test suites run in parallel
  (`pytest -n auto`), the Windows job keeps the pip and npm downloads in cache,
  and the renderer card contracts bundle once and render the stills in parallel
  tabs of a single browser, instead of one `remotion still` per scenario
  (D-917).
- **The stage is now set per cut or project, with separate settings for horizontal and short.**
  The global style stays in Canais → Palco do canal and is the default for
  everything new. In the post-production positioning modal and in the short's
  stage modal, the first line now shows which style applies and where it comes
  from (the channel, the project or the cut). Switching it there changes only
  that cut (or that project), never the channel. Below the preview sit the
  settings of the chosen style only, one tab per component: background,
  header, plate and cards for the horizontal video; background, header and
  windows/caption for the short. The horizontal modal no longer shows short
  settings, and the other way round. Changes save only what differs from the
  level above, and the render of that cut uses them. Presets now show as
  one-click chips and carry their type's stage settings. Every preset list
  (modal, layout panel, short adjustments) shows only the presets of the style
  in effect.
- **The header can show just the image.** Image, name and @ each have their
  own switch, in Canais and in the modals. Name and @ left blank still use the
  channel's identity (D-923).
- **Only the tests are locked now.** Changing, deleting or renaming an
  existing test (`backend/tests/`, the `__tests__/` folders and `*.test.ts(x)`
  files) needs the owner's authorization, with an `[unlock:testes-sao-contrato]`
  mark in the commit. Code and new tests are free. The old per-feature locks
  were removed (D-925).
- **Post-production positioning modal reorganized around a fixed preview.** A
  menu in the left column switches the settings group (Presets · Telas · Fundo
  · Cabeçalho · Placa · Cards). The settings for that group sit beside it, and
  the preview stays still on the right, always fully visible, with no scroll
  bar. What doesn't fit in the column, such as the list of card types, goes
  below the preview.
- **Move and resize with the mouse, for every component.** In the preview,
  dragging moves the screen, the facecam, the cards zone, the header and the
  plate. The handle in the corner resizes them: screens keep their
  proportion, and the header and plate change size in %. Clicking the header
  or the plate opens its group.
- **Size from 25% to 500%** (it used to stop at 200%) for the header, the plate
  and the cards. The number field no longer jumps to the minimum while you
  type: the value is checked when you leave the field or press Enter (D-927).
- **The cards zone is always visible in the positioning modal.** On the
  shared screen, the outline of the cards zone shows up all the time: dashed
  while automatic, solid once you set it. It can be dragged and resized even
  when automatic; the first drag makes it manual. In the Cards group the zone
  comes already selected.
- **Example card.** In the Cards group, pick a card ("Definição", "Pergunta"…)
  and see it drawn on the preview with your current customization (size,
  mode in the space, alignment), before saving. On the full video, that card
  can also be dragged and resized: that is how the cards' position and size are
  set.
- **Align objects with each other.** While dragging, edges and centers stick to
  the edges and centers of the other objects and of the frame, and a line shows
  where they lined up.
- **Crop with the mouse.** In Telas, with "Desenhar" off, the crop moves by its
  body and resizes by its handle.
- **Presets always in view**, in the same line as the style name (they are no
  longer a menu group). The Telas buttons no longer let text spill past the
  edge (D-928).
- **The TikTok cover follows the clip's stage style.** When the horizontal stage
  is in the clean style (channel, project or clip choice), the vertical cover is
  drawn the same way: flat background, rounded art window, the stage's font and
  the accent color on the handle. Channels on the current style keep the same
  cover, byte for byte (D-932).
- **The short stage modal shows only what each style uses.** In the clean style
  the old style's texture section is gone and the clean stage (background, channel
  header, windows) takes its place, instead of hiding at the end; the old style
  keeps its texture and windows sections. In the clean style the channel header
  can now be dragged and resized on the short preview, like on the horizontal
  one (D-937).
- **The channel settings now only choose the style.** The "Palco do canal"
  section keeps the style of the video (horizontal and short), the style of the
  TikTok cover ("same as the stage", current or clean) and the header image.
  The details — header, name plate, cards, windows and presets — are edited in
  the same modal used in the editor, opened by "Editar o padrão do horizontal"
  or "Editar o padrão do short", which now save to the channel. The TikTok
  cover layout editor left the app settings: the cover is styled per channel in
  "Estilizar capa", and the global layout already saved remains the base
  (D-938).
- Na tela de Canais, "Editar o padrão do short" abre o modal do palco do short no modo canal, com a faixa do estilo, o palco do estilo ativo e a prévia "como vai sair" sobre um short de exemplo (o cabeçalho se arrasta nela, no estilo limpo); o modal leve saiu. Aplicar grava no palco do canal (D-946).
- **The full-video card stays visible and belongs to the preset.** In the
  position modal, full mode, the example card now shows on the preview whatever
  group is open, so moving the screen shows whether it will land on the cards.
  Moving or resizing the cards now lights "Update preset", like the screens,
  background and plate. In the clean style the full-screen thesis scene is gone
  (greyed out in the card types, drawn as nothing), and the closing call sits
  where the card sits instead of the middle of the frame (D-951).
- **Vite 8 builds the frontend.** Vite 6.4 → 8.3 and its React plugin 4 → 6
  (the plugin 6 requires Vite 8, so they move together), with the same vendor
  chunks. Also brought up to date, in batch: Remotion 4.0.535 in the frontend
  and the renderer; Radix, React Query, zod, typescript-eslint, vitest, PostCSS
  and Prettier patches; ruff 0.17, anthropic 1.13, pydantic 2.14, scenedetect
  0.7.2 and pre-commit 4.7 in the backend, with the locks regenerated from
  `requirements.in`. Versions younger than five days wait for the next batch;
  react-resizable-panels 4 and lucide-react 1.x stay for their own demands
  (D-827, D-831) (D-961).
- **aiohttp 3.14.5 in the diarization lock.** The optional speaker-diarization
  lock moves aiohttp 3.14.3 → 3.14.5 (newer than the bot's 3.14.4) and, with
  it, yarl 1.24.5 → 1.25.1, which aiohttp 3.14.5 requires. The lock is
  regenerated from `requirements-diarizacao.in` with `--universal
  --python-version 3.11`, so its per-Python markers stay as they were (D-978).
- **The raw-cut evaluator now sees what comes right after the cut ends.** The
  transcript arrives as subtitle lines (only 16% end in punctuation), so the
  evaluator flagged "ends mid-sentence" on 175 of 231 raw cuts, unable to tell
  a cut idea from a plain line break. The material now ends with the next 15 s
  of the live, marked "outside the cut"; if the live ends there it says so
  (D-996).
- **"What you changed" replaces the quality vote.** The per-cut vote (D-419)
  had become a rubber stamp: of 314 votes, 95% were 4 or 5, the reasons were
  used once and the comment once, and it correlated 0.03 with views. The
  per-live vote (D-372) was never used (0 of 202). Both are gone: generating
  the first rough cut no longer opens a question, and their endpoints, schemas
  and screens were removed. In their place, the editorial telemetry derives
  what the operator did to the AI's frozen proposal — start or end stretched
  or trimmed (by how many seconds), title changed, sections added or undone —
  with no extra click. "Why this cut?" now shows that list for the cut, and
  Analyses → Proposal × Final shows it per cut and summed per proposing
  provider, together with the deleted proposals and their reasons (D-993).
  The CSV export carries it in a `mudancas` column instead of the vote ones.
  The vote columns stay in the database, unused, so the history is kept; no
  migration.
- **The live ranking compares comment sentiment within the batch.** The haiku
  only scores lives 5 to 8, and the score went in as an absolute number
  (score/10): every candidate got the same floor, and between a 6 and an 8 the
  sentiment moved the ranking by about 7 of its 33 points. Measured on the 92
  lives that came from the ranking (163 hours), sentiment is the one signal that
  goes with both used cuts and Fire per hour within the same month, and dropping
  it makes the ranking worse on both. It now goes through the same min-max as
  views: the best score in the batch is worth the full weight, the worst is worth
  zero. The weights themselves stay as each channel set them (D-1000).
  A live with no sentiment (no comments, or the haiku failed) used to get a
  fake 5.0; in the batch that would be the worst score. It now sits in the
  middle of the batch and does not stretch the scale of the others; the screen
  still shows the neutral 5.0.
- **`app/models.py` is now the `app/models/` package.** The file sat at the
  file-size ceiling (908 lines), so the next table had nowhere to live. The code
  moved as it was, split into `base`, `projeto`, `shorts`, `snapshots` and `canal`;
  `__init__` re-exports everything, so `from app.models import X` keeps working
  and the schema is unchanged (D-1001).
- **The "pipe exit code lies" rule now says where to write the output.** `AGENTS.md`
  and `docs/qualidade.md` point to `.guia/tmp/<D-NNN>/` (outside git) and forbid
  writing outside the worktree, where five orphan D-995 logs piled up in `C:\DEV` (D-1002).
- **Two batch messages now name the right action.** With a date set, the "your
  turn" notice says to check the date and click the final button, since it
  is not "Publish" there. The Instagram API refusal now points to the "Now"
  mode, which is what the screen offers, instead of "remove the date".
- **Recorte que tira a frase de uma cena agora desfaz a marca de "cenas validadas".** O operador tinha validado aquela cena sobre aquela fala. Só mover a cena junto com a frase mantém a marca.
- **Changing cuts no longer changes screens.** J, K, the selector arrows and the
  side list used to open the next cut at whatever stage it had reached: K in the
  editor of cut 5 could land on the final review of cut 6. Now the editor, the
  post-production screen and the final review stay where they are and only the
  cut changes. Each cut opens in a fresh instance of the screen, so a selection,
  undo history or draft from one cut can no longer be applied to the next. As a
  result, player speed, smart play, pointer mode, the open side tab and the
  Remotion preview return to their defaults when you change cuts. Finishing a raw cut still leads to post-production and finishing a render
  still leads to the final review, but only if the screen was watching that work:
  going back with J to a cut that finished while you were away stays on the
  screen (D-1033).
- **The main button now names the next real step of a cut.** In the editor, an
  approved cut showed "Approved" as its main button, and clicking it or pressing
  Enter sent the cut back to proposed. Approval now sits apart, with a Return
  button beside it, and the main button says "Generate raw cut" or "Go to
  post-production". In the live's list, "Finish" always opened post-production;
  it now says what is missing (raw cut, scenes, render, cover, metadata) and opens
  the screen where that is done. In post-production, a cut that never had a raw
  video no longer claims the cleanup deleted it, and its main button leads to the
  editor (D-1041).
- **What is still open now travels with the cut.** The action bar of the editor,
  post-production and final review lists it (scenes to validate, items to check,
  scene warnings, a raw cut older than its segments) without blocking anything. If
  segments change after the raw cut was generated, the editor says so and its main
  button offers to regenerate it. With a cut open, each step of the top trail
  summarises that cut; the live's page keeps counting the live. In the technical
  report, frozen images and rough splices now jump to that moment in the video.
  "Audio normalized", always green even beside a low-volume warning, gave way to
  "Scenes validated". Generating a raw cut with the live no longer on disk now says
  to download it again from the Library (D-1044).
- **Shorts now belong to the cut's journey.** The cut's row and the final review
  link to "Shorts deste corte (5)". Both Fire screens get a step trail, Curar and
  Prateleira, with what each one still has open, and their breadcrumb leads back to
  the cut's row in the live, which comes into view with focus on it. In the
  Prateleira, the button that renders a short now says "Renderizar"; "Finalizar"
  stays only on the Fire card, where it is the operator's declaration (D-1051).

### Removed
- Saiu o endpoint `GET /api/settings/capa-tiktok/layout`, sem uso na tela desde a D-938; o layout global segue como base da capa e chega à tela pelo painel do modal Estilizar capa (D-948).

### Fixed
- **"Informar a URL publicada" no longer disappears once the cut is on
  TikTok.** When the YouTube upload failed but the video went up anyway, the
  row's ⋯ menu offered only "Liberar publicação" if the horizontal TikTok
  was already confirmed, so the YouTube video could never be registered. Now
  informing the URL depends only on YouTube, and both options show up
  together when the cut is on TikTok but not on YouTube (D-906).
- **The TikTok cover no longer gets lost when the robot publishes.** The
  thumbnail changes the instant "Salvar" is clicked, but TikTok only finishes
  sending the cover to its servers seconds later — measured at ~6 s on a
  horizontal video. The robot took the new thumbnail as proof and could publish
  inside that window, so the post went out with a video frame. It now waits
  for TikTok's own confirmation that the cover was received; without it the
  cover counts as not applied and the robot does not publish on its own (D-902).
- **Cards in a shared-stage segment land where the preview shows them.** When a
  segment moved its screens (slots, crops or screen count) and left the cards
  on "Automática", the editor placed the card by the segment's screens but the
  rendered video still used the cut's base screens, so the card jumped to
  another spot. The render now uses the segment's screens too. Cuts already
  rendered this way get the new card position only if rendered again (D-907).
- **A hook that starts with the highlighted word keeps its capital letter.**
  The hook always opens with a capital, but when it started with the
  highlight (`*ninguém* te conta`) the first character was the asterisk and
  the sentence came out in lowercase. The capital now goes on the first
  letter, skipping the highlight mark (D-919).
- **Stable renderer card contracts.** With the stills rendered in parallel
  tabs (D-917), Remotion sometimes reported the page ready before the
  compositions registered, and the contract run failed with an empty
  composition list. That one error is now retried up to three times, with a
  warning in the log; a composition that is really missing still fails at
  once (D-920).
- **The post-production stage modals show and edit the channel's stage style.**
  The positioning modal of a cut and the stage modal of a short always drew
  the old stage (texture and chamfered chrome), even with the channel set to
  "Limpo". Both now carry a "Palco do canal" panel — the same form as in
  Canais: style, clean background, header, plate, short and cards — and their
  preview draws what is being edited before it is saved. Saving there applies
  to the whole channel, as in Canais. Stage presets remember the style they
  were made in, and each modal lists only the presets of the chosen style;
  presets saved before this count as the current style (D-921).
- **Clean-style cards show up again in the editor preview and in Studio.** In
  the "Limpo" style, cards counted their time from the start of the whole video
  instead of from their own start. Any card starting later than its own
  duration (in PROD, 93% of them: Definição, Pergunta, Informação…) was treated
  as already over and drew nothing. Rendered overlays were not affected (each
  card is a separate piece there), but the preview showed no card at all in 216
  cuts.
- **New: how the card sits inside the cards zone (shared screen, clean
  style).** In Canais → Palco do canal → Cards, and in each cut's modal:
  - "Ocupar o espaço": the card grows when the text is short and shrinks when
    it is long, until it fits the zone (up to 2.5× its normal size).
  - "Tamanho natural": the card keeps its size and only shrinks if it doesn't
    fit.
  - Vertical alignment (top, center, bottom) and horizontal alignment (left,
    center, right) place the card in the zone. The default is to fill the
    space, centered, so a small card no longer sticks to the top of the zone
    (D-926).
- **The card contract tests no longer fail at random on CI.** The test picked
  the scene composition once per card, 80 times per run, with four tabs
  fighting for the CPU; sometimes the composition list came back empty and the
  run failed, freezing the merge queue. The retry added in D-920 never kicked
  in, because Remotion prefixes the message with "Error: ". Now the composition
  is picked once, before the parallel renders, and the retry recognizes the
  real message. Every card image is byte-identical to before (D-930).
- **The "número em destaque" card now goes to the cards zone.** On the shared
  screen it appeared over the small screen instead of in its own space. It was
  the only card type missing from the zone's list. In the zone, the old style
  shows just the ring and the number, without the full-frame grid background
  that would cover the screens (D-931).
- **Horizontal videos follow the audience window too.** The bulk YouTube upload
  now asks the backend for the schedule: the channel's blocks for long videos
  (12:00 and 18:00, four per block, every 15 minutes, by default), the daily cap
  and the overflow to the next day, starting after the last clip already
  scheduled or still uploading — instead of a fixed 15-minute spacing from a
  typed start. Each row can be adjusted, and "one date for all" is the
  alternative. The horizontal TikTok batch spreads over the TikTok blocks, in the
  same queue as the TikTok shorts, and sending a single clip opens with the next
  free slot (D-934).
- **The YouTube Studio robot now turns monetization on for the whole batch at
  once.** It used to open each video's page, where the Studio asks for extra
  answers, and it never finished. Now it does what you do by hand: in the
  Content list it ticks the videos it just uploaded, then Edit → Monetization
  (On) → Update videos, and confirms. Cuts go through the Videos tab and shorts
  through the Shorts tab. A video that is not on the first page of the list, or
  a batch the Studio updated only in part, shows up as a warning in the robot's
  window. The robot also stopped missing the Studio's redirect to your channel
  (D-935).
- **The channel header shows up on clean-style shorts.** It only had a place in
  the strip above the top window, so in the full-frame arrangement (the default)
  and in the insert it disappeared without notice. With no strip, it now sits
  inside the top window, over the video, on a dark pill that keeps it readable.
  The short preview also draws the windows with the area the video really takes,
  as the render does, so it no longer drifts by the letterbox (D-936).
- **Cover references no longer overlap, and only the lead's show.** On the
  Channels screen, a long file name (like the ones ChatGPT gives its images)
  widened its card's column, and the picture spilled over its neighbours, in
  both the mascot sheets and the presenter photos. The card now keeps its
  column, and the name is cut with an ellipsis. Each grid also follows the
  chosen lead: with the mascot, only its sheets; with the presenter, only the
  photos. The other set stays saved, with a line saying how many there are
  and how to bring them back (D-939).
- **The live's transcript, and the shorts' subtitles, come in Portuguese again.**
  When YouTube offered the subtitles in more than one language, the download
  kept them all and the ingestion took the first file in alphabetical order,
  so `en` beat `pt` and the cut came out in English. Now the language is picked
  by priority (pt, pt-BR, pt-PT, then en); English is used only when it is the
  only subtitle the video has. Projects already ingested in English are fixed
  with "Refazer transcrição" (D-940).
- **A busy machine no longer blocks the final render at the stage PNG.** The
  Remotion still gives Chrome a fixed 25 s to answer; with the bundle and the
  overlays of the same render running, Chrome took longer and the whole render
  stopped at 12%. When Chrome does not answer, the stage generator now tries
  again (up to three times, five seconds apart); any other failure still blocks
  on the first attempt, with its diagnostic (D-942).
- **A busy machine no longer fails the TikTok cover.** The cover generator runs
  the same Remotion still as the stage PNG, which gives Chrome a fixed 25 s to
  answer; it now tries again when Chrome does not answer, like the stage already
  did (D-942). Two download-deadline tests also stopped mistaking the slow start
  of their fake process for silence (D-949).
- **A busy machine no longer leaves a short without its frame.** The short's
  stage PNG runs the same Remotion still as the horizontal stage and the TikTok
  cover, which gives Chrome a fixed 25 s to answer; it now tries again when
  Chrome does not answer, like the other two already do (D-950).
- **Gemini answers no longer time out after they are ready.** The Antigravity
  CLI (`agy` 1.3.x) answers and then stays alive for 10-15 minutes polling in
  the background; the app waited for it to exit, threw the finished answer away
  at the 880 s timeout and held the Gemini queue meanwhile. It now returns as
  soon as the `result` event arrives and ends the leftover process by its PID
  (D-953).
- **A stuck Gemini call no longer outlives its timeout.** The prompt (80-200k
  characters) was written to the Antigravity CLI on the calling thread; if
  `agy` hung without reading it, the write blocked past the timeout and held
  the Gemini queue. The write now runs in its own thread, so the timeout covers
  it and the process tree is killed when it expires (D-954).
- **Covers generated in ChatGPT carry their reference photos again.** ChatGPT
  added a "Take a photo" camera input ahead of the photo upload field, and the
  robot handed every attachment to the first image input it found: the request
  went out with no host frames and no photos of the people in the cover. The
  robot now picks the field that takes several images and is not the camera,
  and stops with a clear message instead of sending a cover without references
  (D-955).
- **Cover reference frames no longer pick a face on a wall poster.** In lives
  with the camera full screen and a poster with a drawn face behind the host,
  the robot sent ChatGPT three crops of the poster. The host was chosen by how
  much the head-and-shoulders area changed: the poster's small area grew with
  the host's head moving into it, and the host's large area diluted his motion.
  The choice now measures that change on the face itself (D-956).
- **Cover reference frames stop at the camera frame, before the live's banner.**
  In lives with the camera in a framed window, the host's face is large and the
  head-and-shoulders crop ran past the window: the channel bar on top and the
  "NOVO ASSINANTE / CHAVE PIX" banner below went to ChatGPT as reference. The
  crop now stops at the nearest horizontal edge that crosses it in every frame;
  what sits behind the host never does, because the head covers part of it
  (D-957).
- **A horizontal cut no longer goes to TikTok on its own without the vertical
  cover.** With "publicar sozinho" on, a cut that has no vertical TikTok cover
  used to be posted with whatever frame TikTok picked. Now the robot leaves the
  tab ready, does not press Publish, and says the cover is missing, both from
  the batch and from the cut's own button. Shorts are unchanged (D-958).
- **YouTube Studio monetization always takes the 3 newest videos of each tab.**
  Now and then the Studio left a video unmonetized, and nothing went back for
  it. The bulk edit now also checks the 3 videos at the top of the Videos and
  Shorts tabs, so a video missed in one round is picked up in the next (D-959).
- **The short's stage preset now follows the active style and keeps the whole
  stage.** Creating or editing a stage from "Padrões do corte" used to show the
  old style's texture and no header controls, and saved only the layout: the
  preset came out without its style (so it vanished from the clean style's
  list) and without the name, @ and header. Now that editor shows only the
  active style's sections, the preset carries the style and the stage, and
  choosing it as the cut's default brings that stage to the cut. The "Palco"
  select in "Padrões do corte" lists only the active style's presets (D-960).
- **The host's face on AI covers is human and restrained, not clickbait.**
  The covers copied the eyebrows the host raises mid-sentence, and the image
  generator exaggerated them into a challenging stare. The cover now takes the
  emotion from the live frames at a natural, conversational intensity, and the
  host photos saved in the channel settings go along with the frames on every
  cover, so the face comes out right (D-962).
- O PNG do palco do YouTube não reempacota mais o Remotion a cada geração: o pacote é montado uma vez por versão do renderer e o render deixa de estourar 300 s com a máquina ocupada.
- O PNG do palco do short não reempacota mais o Remotion a cada geração: o pacote é montado uma vez por versão do renderer e o short deixa de sair sem moldura com a máquina ocupada.
- O card de Contraponto no vídeo cheio com caixa em pé agora empilha os dois lados, um em cima do outro, como já fazia na tela compartilhada; lado a lado ele encolhia até a letra ficar ilegível.
- O modo do corte (FULL/COMP.) agora vale quando difere do projeto: escolher FULL num projeto COMP. não volta mais sozinho, e as duas pílulas não ficam desmarcadas. Adicionar uma região manual não troca mais o modo do corte. O padrão Global volta a chegar aos projetos que não ajustaram o próprio: "Definir Global" deixou de copiar o padrão para dentro de cada projeto, e o tipo do projeto mostrado na tela passa a ser o herdado do Global. Atenção: um projeto com o tipo FULL escolhido sob um Global COMP. antes renderizava COMP.; agora renderiza FULL, como a tela já mostrava.
- O título do YouTube no modal de metadados da Bancada não perde mais o foco enquanto se digita: o vídeo tocando ou a fila de render atualizando a tela jogavam o foco para o botão de fechar (D-967)
- As capas novas (a do YouTube e a do TikTok) e o elenco conferido (foto trocada, pessoa tirada ou posta) não voltam mais ao que eram ao fechar e reabrir o modal de metadados — nem quando o robô termina com o modal fechado; e o Esc com a capa ampliada fecha só a capa.
- A capa nova aparece também na miniatura da linha do corte e na consulta de metadados: a imagem não vem mais do cache do navegador quando a capa é refeita.
- No painel de layout do corte, o corte que herda o modo agora mostra de onde ele vem de verdade (Projeto, Global ou padrão do app); antes dizia 'do Projeto' mesmo quando o projeto também herdava do Global (D-970)
- No painel de layout do corte, o corte que troca o modo agora diz de quem ele está discordando de verdade (Projeto, Global ou padrão do app); antes dizia 'sobrescrevendo o Projeto' mesmo quando o projeto não tinha modo próprio (D-971)
- A legenda da prévia do short passa a seguir a transcrição refeita, e o menu ⋯ da tela do short ganha 'Atualizar legendas' (D-972).
- A legenda da prévia do short também acompanha as outras ações que ressincronizam a transcrição do corte: salvar trechos, mover início e fim, dividir, juntar, reordenar blocos, gerar trechos com a IA, diarizar, gerar o bruto e a fábrica de shorts (D-973).
- No modo da capa "apresentador", o prompt da capa do short e da arte do TikTok que ainda descreve o mascote volta uma vez para a IA com um aviso e, se insistir, a geração falha com uma mensagem clara em vez de gravar; o bloco do modo também avisa que o personagem do prompt do YouTube não é o apresentador, e a roupa do mascote não passa para ele (D-974)
- Na tela de Shorts, a dica de 'Gerar bruto e shorts com IA' não promete mais deixar a transcrição intocada: refazer o bruto não refaz a transcrição da live nem as cenas, mas a do corte se ajusta aos silêncios (D-975).
- A análise da live termina gerando os trechos a remover de cada corte novo, com a mesma IA, em segundo plano: a live nova não chega mais com só 2 ou 3 trechos por corte, e não é preciso clicar em 'Gerar trechos' (D-976).
- O preset aplicado no padrão global do pós agora leva os cards junto: antes só a posição das telas ia para o global, e o corte mostrava o preset como em uso com os cards do canal. (D-981)
- **Pillow 13.0.0 and certifi 2026.10.19.** The backend's pip-audit gate failed
  every PR since 21/10/2026: Pillow 12.3.0 carried two critical advisories
  (CVE-2026-112900, Ghostscript argument injection through EPS; CVE-2026-112393,
  TIFF encoder heap overflow) and about twenty high/moderate ones, and certifi
  2026.7.22 still trusted the compromised `emSign ECC Root CA - G3`
  (PYSEC-2026-4320). 13.0.0 is the only Pillow release that fixes them; its
  breaking changes (Python 3.10 dropped, I-mode PNG, `fromarray` mode,
  `get_child_images`, `ExifTags.IFD.Makernote`) touch no code here, and the
  cover and thumbnail tests, including the 4:4:4 encoding (RN-23), pass on it.
  The three locks are regenerated with `--universal --python-version 3.11`,
  upgrading only these two packages, so the per-Python markers stay as they
  were (D-982).
- **TikTok scheduling works with the new date picker.** TikTok Studio replaced the two schedule inputs with comboboxes, so the robot waited 15 s for a date field that no longer exists and the rest of the batch stalled. The date and time pickers are now found by their `aria-label`, and the chosen date is checked against the text the field shows ("23 de out de 2026") (D-983).
- Aplicar um preset pelo atalho Definir ▾ da escada agora leva os cards junto, como o modal; e um preset do Compartilhado não desarruma mais a posição dos cards dos cortes em Full. (D-985)
- **zod 4.6.7 in the video renderer, for every Remotion package too.** The
  renderer's `npm audit` gate failed every PR since 24/10/2026 with
  GHSA-mrhx-c7xc-m3w5 (high: zod below 4.6.6 can exhaust memory validating
  oversized constrained collections). The renderer pinned zod 4.5.4, and the
  Remotion packages (studio, studio-server, studio-protocol, media,
  elevenlabs, openai-whisper) pin 4.5.4 themselves, even in their latest
  release, so bumping our pin alone left a vulnerable nested copy. The pin goes
  to 4.6.7, the version the frontend already uses, and an npm `overrides`
  entry makes Remotion share that single copy. The scene schema API is
  unchanged: lint, the card contracts, the bundle and the frontend's preview
  tests pass on it (D-986).
- **Gemini (Antigravity) now tells the operator how to sign in again.** Antigravity CLI 1.4 reports a missing login with a new phrase that the app did not recognize, so the call was retried for nothing and failed with a generic status. The app now recognizes it and explains the new flow: run `agy`, sign in with the subscription's Google account and paste the generated code back into the terminal, not into CutCut, which never receives the token (D-990).
- **The Biblioteca card counts the cuts the render already finished.** A cut
  moves from "aprovado" to "processado" when its final render ends, but the
  library listing only counted "aprovado" — so a live went blank on the card
  exactly for having finished: no network chips (the D-987 ones need at least
  one ready cut), the stage strip showing Bruto, Pós and Metadados as pending,
  and the badge falling back to "analisado" on a live already rendered. Of the
  186 lives with a published cut on 29/10/2026, 129 read zero. The four counts
  (approved, with raw, with metadata, and the ready/published population behind
  the chips) now ask for both statuses, from one rule that lives with the cut's
  lifecycle; the project screen, which always asked for both, now reads it from
  there instead of its own copy. Proposed and rejected cuts stay out, and the
  raw count still depends on the file being on disk (D-992).
- **A failed YouTube stats sync now shows on screen, and the sync runs by
  itself.** Between 10/07 and 27/10/2026 the Desempenho YouTube sync was refused
  (the channel token lacked `yt-analytics.readonly`) and nothing said so: the
  error only reached the log, and the tab kept showing an old "last sync" date.
  The status now carries the last failure; the tab shows it with the message and
  the date of the last successful sync (or "never"), and the tab gets an alert
  dot so it is seen without opening it. The re-authorize message no longer tells
  you to restart the backend (the token is re-read on every sync) and says
  `auth_youtube.py` must run inside the folder of the installation that syncs,
  since run elsewhere it writes that folder's token. A background loop now syncs
  once a day, starting a minute after boot, with a 10-minute cap per run, and
  survives a failed run.
- **The robot's Chrome no longer keeps a tab after a batch.** The robot's
  Chrome is launched on a URL (the TikTok account check, the YouTube Studio),
  and the script then works in a new tab; that launch tab was never closed, so
  every TikTok batch and every Studio run left one behind. Now, when the whole
  batch ends — the lane and every tab watch — the robot closes the tabs it left:
  the launch tab and the ones already published (including those the robot
  published itself). A tab still holding an upload that waits for the
  operator's Publish stays open, and so do the Studio tabs when something
  failed, since that is where the reason is read.
- **The YouTube Studio robot no longer times out while turning monetization on
  for a batch.** The wait for the "N of M videos updated" notice had 300 s on
  paper, but each check read the notice's text with the browser's default
  30 s wait and gave up when the notice was not on the page yet — and the
  bigger batches since D-959 (up to 3 extra videos per tab, ~12 s each) take
  longer than that. The robot now reads the notice only once it exists, and
  waits up to a field's time (not 5 s) for a row's checkbox. When something
  still fails, the message names the tab and the step ("Update videos",
  "I understand", marking a row...) and the rest carries on: a stuck row
  leaves only that video out, and a failure in the Videos tab no longer skips
  the Shorts tab. The cause was inferred from the code, since production no
  longer writes the robot's console to a log file (D-1004).
- **The YouTube Studio robot no longer leaves a short's edit tab open when a
  batch fails.** Any failure kept the tab, on the grounds that the reason could
  be read there; but a failed bulk monetization (`0 of 3` on the Shorts tab) left
  it on the edit page of an unrelated short, one tab per batch, with no reason on
  it. Now the tab closes and the reason goes to the log, along with the Studio's
  full notice when it updates fewer videos than asked. Only a tab asking for
  login stays open, and it is the only batch failure that brings the window on
  screen; a connection lost mid-batch still does too.
- O atalho de gerar o bruto agora responde na hora: avisa que está processando, avisa quando o bruto já está em andamento, e o selo do player mostra o processamento até o fim (D-1008).
- **O áudio do short agora sai em -14 LUFS, como o do corte horizontal.** Antes saía sem normalização (-16,2 a -19,8 LUFS, com picos clipando); a normalização roda uma vez, na composição final (D-1014).
- **O pico do áudio final agora fica abaixo de -1 dBTP.** O AAC a 192k estourava o que o `loudnorm` entregava, chegando a +3,2 dBTP; agora o corte e o short miram -1,5 dBTP e saem em AAC 256k. Filtros de voz ficaram de fora porque o teste às cegas não mostrou diferença audível (D-1016).
- **The horizontal cut goes to TikTok with its generated title.** The package
  read the curation label instead of the title generated for the audience, so a
  manual cut went out as "Corte manual #3" even with a real title saved, and AI
  cuts went out with their curation title too. It now uses the generated title,
  without the 🔥. A cut that only has the placeholder label is refused, with a
  message asking to generate the metadata first (D-1021).
Render de corte sem cenas deixou de falhar com `AttributeError`: segue sem overlays.
- **O boletim técnico deixou de mostrar medida errada como certa.** "Medir de novo" agora apaga o boletim guardado (antes o velho voltava como pronto); FFmpeg que morre no meio vira falha, não boletim parcial; e as emendas são localizadas com os trechos com que o bruto foi realmente cortado. Se o bruto foi regerado depois do render, ou é de antes do registro dos trechos, a tela diz que as emendas não foram medidas e por quê (D-1024).
- **Emphasis, list, lower-bar and timeline scenes in the clean style no longer
  come out with near-invisible black text.** Only the shared `Bloco` set the text
  colour; those four scenes do not use it and inherited the document's black, so a
  title like "MEGAZORD" was black on the dark scrim. The colour now comes from
  `Enquadramento`, which wraps every clean scene, and the card-contract test fails
  if any clean scene draws near-black pixels. Videos already published keep what
  they were rendered with.
- **Automatic AI generation no longer inherits the owner's global instructions,
  and a refusal now says why.** The `claude -p` the app runs read the owner's
  personal `CLAUDE.md` even from a temp folder, so the "teacher mode" leaked
  into scenes, excerpts and metadata and could turn the JSON into conversation.
  The call now disables `CLAUDE.md` loading and stays on the subscription login.
  When the AI answers with text instead of JSON, the screen shows what it said
  instead of "Expecting value: line 1 column 1".
- **The technical report finds each splice in the final video instead of
  calculating it.** It added up the durations of the pieces and stretched the
  total over the video's length, which put splices up to 1.9 s away from where
  they are (D-1017 measured 8 cuts: 25.8% of splices looked like "sound on both
  sides" that way, against 1.7% at the real position). Now the last second of
  each piece is searched in the final video by correlation with the live, or
  with the raw cut for shorts. It takes 2 to 18 s per cut on this machine. A
  splice that cannot be found with certainty is counted as "without a certain
  position" and left out of the count, and without the live on disk the line
  says why. Raw cuts made before this change need to be generated again to
  have their splices measured (D-1027).
- **One cut failing to resync no longer takes the others down.** When saving a
  cut's transcript hit "database is locked", the retry's rollback expired the
  other cuts of the project that were still waiting their turn, and reading
  their id blew up with `MissingGreenlet` — hiding the real error. The batch
  now walks over ids, isolates each cut's failure so the rest are still
  synchronized, and re-raises the first error at the end instead of losing it.
- Marcar um trecho pelo atalho do bruto agora move as cenas e desfaz a marca de validadas na hora, sem esperar a próxima sincronia da transcrição (D-1031).
- **The Workspace no longer calls a live "empty" when the cuts failed to load.**
  With the cuts API failing, the screen said "Esta live ainda não tem cortes"
  and offered "Analisar com a IA", which adds cuts to the existing ones and
  spends AI. It now shows the failure with its message and "Tentar de novo",
  and "Reanalisar" in the menu is disabled until the list loads. A refetch that
  fails while the list is already on screen keeps the cuts visible.
- Renderizar de novo não leva mais à Revisão assim que começa: o vídeo do render anterior no disco só conta como concluído com o backend ocioso (D-1035).
- Na Pós, trocar de corte (J, K, setas, lista) ou sair da tela com cenas ou layout sem salvar não perde mais o ajuste: ele é salvo antes de sair, e se falhar a tela fica e avisa (D-1036).
- **The same cut no longer pays for its scenes twice.** While the raw clip's chain
  was generating scenes, Pós showed an empty list and a free "Gerar cenas"; after
  switching cuts and coming back, the button was free again too, and the server
  accepted the second request. Each generation costs about US$ 0.33 and takes 256 s
  at the median. The server now keeps an in-memory mark per cut, taken when a raw
  clip that will generate scenes starts, and refuses a second generation with a clear message,
  whichever of the two sources came first. The raw clip waits too: it refuses to
  start while scenes are being generated, and the scene route refuses while a raw
  clip started from the screen can still rewrite the transcript, up to the shorts
  step, because the scenes would come out of time. The raw clip the shorts factory
  regenerates is not covered by that refusal.
  The mark clears on error, cancellation and restart. Pós says
  "gerando cenas" with generate and validate locked, and the cut's row and the
  status bar say the same instead of asking to generate, validate or render,
  including after coming back or reloading the page. The new scenes appear by
  themselves.
- **The live's cut list no longer says "this live has no cuts yet" while it is
  still loading.** Right after "Try again" on a failed load (and on the very
  first load), the screen briefly flipped to "This live has no cuts yet" with
  the "Analyze with AI" button, and the menu's Reanalyze came back enabled,
  even though the list had not arrived. Now it shows "Loading the cuts…" and
  keeps Reanalyze disabled until the list is really there.
- **The transcript routes no longer leave a project and its cuts out of step.**
  `PATCH /transcricao` and `PUT /sincronia-legenda` kept the new text pending in
  the session of the batch that copies it to the cuts, so the first rollback (a
  cut with invalid data, or "database is locked") threw it away while the next
  cuts still saved it. With the lock, the route even answered 200. The transcript
  and the subtitle offset are now saved first; a cut that fails stays as it was,
  and the error is still returned. `PUT /sincronia-legenda` also stopped answering
  500 with `MissingGreenlet` after a lock, and `PATCH /transcricao` now refuses
  with 400 a transcript that is not a list.
- Marcar um trecho pelo atalho do bruto não responde mais 500 quando a sincronia da transcrição falha: o trecho fica gravado e aparece na lista, a tela avisa que a transcrição e as cenas não acompanharam, e repetir o mesmo intervalo refaz a sincronia em vez de gravar outro igual, dizendo que o trecho já está na lista. O botão Atualizar transcrição também avisa quando falha (D-1040).
- **Generating metadata no longer writes over text that already exists.**
  The "Gerar bruto" gesture now fills only what is missing, so a title written by
  hand stays. With a title and no description, the card's button says "Completar
  metadados"; "Regerar metadados" still replaces everything, with Desfazer. A new
  request while a generation is running is refused instead of paying for another
  call.
- Cancelar uma geração pela fila agora encerra o `claude -p`, com os processos filhos, na hora. Antes ele seguia trabalhando até o timeout, e um pedido novo pagava a mesma geração de novo. O cancelamento que chega antes de o processo abrir impede que ele abra, e as cenas da geração cancelada não são gravadas, salvo se a gravação no banco já tiver começado. Vale para a geração que a fila consegue cancelar, como a da cadeia do bruto; o item de IA disparado pelo clique ainda não atende ao Cancelar (D-1045).
- **Regenerated scenes no longer count as validated.** "Generate again" warned that
  the validated mark would be lost, but the mark stayed on the new scenes, so the
  Review checklist said "Cenas validadas" for scenes nobody had checked. Replacing
  the scenes now clears the mark on all four paths: the button, the Gemini route,
  the manual import and the raw-cut chain. A generation that fails or is refused
  keeps the scenes and their mark, and moving scenes with a cut or filling in
  portraits does not touch it (D-1046).
- **Scenes no longer run alongside the raw cut of the shorts factory.** The factory
  regenerates the raw video without marking the cut as busy, so a click on
  "Generate scenes" went through while the silence safeguard was rewriting the
  transcript, and the scenes could come out of sync with no warning. Every raw
  cut now holds the existing scene mark until it reaches the shorts step, which
  does not touch the text. The screen still says "generating scenes" only when
  scenes really are being generated. A raw cut also marks only its own progress
  now: the end of an older one could tick the shorts step of a newer one and let
  the click through mid-safeguard (D-1048).
- **Scenes stay on their phrase when the cut changes during generation, except in manual
  mode.** The AI answers with
  a subtitle number, and the import looked that number up in the transcript of that moment:
  removing a stretch while the AI was working left the scene on another line, with no
  warning (42 s against 30 s in the test). Scenes now convert against the transcript the AI
  read and follow the words, like saved scenes do. Nothing in the editor waits for the AI,
  except split and join, which are refused because they change which cut exists. A scene
  whose words left the cut stays where it is and shows the warning. Gemini generation now
  holds the same mark as the others, and manual import is refused while the mark is taken.
  The exception: in manual mode, a scene does not follow a transcript edit made between
  copying the prompt and pasting the answer, and lands on the wrong line with no warning
  (D-1049).
- **The metadata card no longer erases text you typed and have not saved.**
  Typing during "Completar metadados" used to lose the text when the generation
  ended, and the same happened when another field was saved or a new cover
  arrived. An edited field now stays as it is, an untouched field receives what
  arrived, and a draft never moves to another clip. "Regerar metadados" still
  replaces everything, and Desfazer now brings back what you had typed as well.
- Render que não refez o vídeo não leva mais à Revisão: "só a grade" termina como render parcial e o backend reiniciado no meio avisa na Pós, em vez de abrir o vídeo anterior como se fosse o novo (D-1057).
- **Desfazer on the metadata card now survives leaving the screen.** Starting
  "Regerar metadados" and then closing the modal or moving to another clip used to
  lose the previous version for good once the generation ended. It now waits with
  its clip and is offered there, and only there, until you choose Desfazer or
  Manter or regenerate again. It lasts until the page is reloaded.
- **Desfazer now wins over text typed after "Regerar metadados".** Typing right
  after the regeneration and clicking Desfazer could leave the typed text on
  screen, ready to overwrite the restored version on the next blur.
- **Finding portraits no longer erases scenes that changed during the search.**
  The search reads the scenes, spends up to tens of seconds on the network and
  then saved what it had read, so a paid generation, an edit or a sync finished
  in that window vanished with a success message. It now saves only if the scenes
  are still the ones it read; otherwise it saves nothing and tells the operator to
  search again. The Portraits item is also disabled while scenes are being
  generated, with the reason in its tooltip.

## [0.6.0] - 2026-10-07

### Added
- **See the AI's score and why it chose each cut.** Every row in the live's
  cut list shows an "IA 22/30" badge (hook + flow + value, 0–10 each), and so
  does the action bar of the editor, Pós and review. Click the badge or press
  **W** to open a short "why": the score with its three bars, the
  justification, the hook sentence and the topic. "Dar a minha nota" opens your
  own quality vote, so you can compare. The score ranks the cuts of one live; it
  is not an absolute grade. Cuts without a score show no badge (D-886).
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
- **Dependencies brought up to date, in batches.** Remotion 4.0.532 in the
  frontend and the renderer (not 4.0.533, which is missing packages on the
  registry); vitest and @vitest/ui 5; fastapi 0.142.2, anthropic 1.11,
  google-auth-oauthlib 1.5 and google-auth-httplib2 0.4.4; Radix, React Query,
  typescript-eslint, PostCSS and Vite 6.4.4 patches; mako and multidict in the
  diarization lock. The Python lock is regenerated from `requirements.in`,
  keeping its per-platform markers (D-890). Earlier in the cycle: sqlalchemy
  2.1.1, uvicorn 0.54, zod 4.6.5 and `@types/node` 24 (D-824). Tailwind 4 and
  react-resizable-panels 4 stay for their own demands (D-764, D-827).
- **Renaming has its own icon.** The "Renomear" buttons of the stage
  presets (in the positioning dialog and in the shorts presets) used a
  pencil that, at 16 px, was almost the "Editar" pen; they now show a text
  cursor in a box, and so does the "Renomear" that confirms the dialog,
  which had a save icon. The pencil left the icon set (D-888).
- **The editor's side panel fits, and color is left for state.** The four
  tabs (Trechos · N, Ordem, Transcrição, Avaliação) fit in one row from a
  344 px column — a 1440 screen — where Transcrição and Avaliação used to
  scroll out of view; narrower, they wrap to a second row. Trechos are generated with "Claude" and
  "Gemini" written side by side; Manual became an icon. "Influenciar a capa"
  left the editor: it stays in Metadados, where the cover is decided. The
  start and end buttons read "[ Início aqui" and "Fim aqui ]" in neutral
  instead of green and red, the speed is no longer amber and the time each
  trecho removes is gray, not red (D-871).
- **The Workspace's main action lives at the bottom right, like the editor's,
  and says the live's next step.** "Analisar com a IA" for a live without
  cuts; "Aprovar os N propostos", which asks for confirmation and approves
  every proposed cut of the live, even those hidden by search or filter,
  without touching your selection; "Renderizar o #N", which opens that
  cut's Pós (there is no batch render); then "Publicar N cortes" (off,
  saying why in at most two lines, until everything is ready); "Tudo no ar"
  when nothing is left. While the live loads there is no button; while it
  downloads, transcribes or is being analyzed the button says so and is off.
  A cleaned-up live never asks to render, and with cuts left behind it says
  "Live encerrada". Switching lives drops a pending confirmation. The
  Publicar button left the Workspace band; "gerar trechos" stays there. In
  the editor, "Gerar bruto" and "Excluir corte" moved from the top bar into
  its "Mais" menu, with Excluir in red (D-870).
- **Focus mode on a live's screens.** Entering a live (Workspace, Cortes, Pós,
  Metadados, Revisão), the left rail collapses to icons by itself — the
  editor's player gains ~150 px. Opening it by hand (Ctrl+B or the button)
  keeps it open across that live's screens until you leave; the next time
  you enter a live it collapses again. Outside a live your choice is kept as
  before (D-869).
- **Each cut row says its state in words and has one action.** The 11 codes
  (CENAS BRU CEN · RENDER GRD OVL FIN · PUBLICAÇÃO THU MET YT) became an
  8-step bar with a sentence — "3 de 8 · próximo: renderizar overlays", or
  just "no ar" — and each step still explains itself on hover. Steps differ
  in shape too, not only color (done is solid, current is hollow). In a
  narrow window the bar moves under the title, so the title keeps its room.
  The Pós screen and the metadata modal now use the same "próximo: …" verbs.
  Six icon buttons became "Editar" and the state's main action ("Aprovar",
  "Finalizar", "Enviar ao YouTube", "No ar", "Voltar") with labels, plus a
  "⋯" with Pós-produção, Metadados, the cut's folder and the published URL
  (or "Liberar publicação"). Targets are 32 px. While a row's "⋯" is open it
  shows above the rows below, and the row's keys (A, R, J, K) wait (D-868).
- **Rare Workspace actions moved to a "Mais" menu.** Reanalisar, refazer
  transcrição, auditar análise and abrir a pasta were a row of unlabeled
  icons, each in its own color, in the middle of the screen. They are now
  labeled items in a "⋯ Mais" menu in the Workspace header, next to "Ver no
  YouTube" and "Novo corte"; "Auditar análise" explains why it is off when
  the live has no cuts. Menu items that are off now stay focusable and show
  their reason on hover in every "⋯" menu of the app (D-867).
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
- **The Workspace cut row has tests for what it already did.** Mutation tests
  in the D-868 audits broke six behaviors of the row and no test noticed: the
  broken cover hiding after a media cleanup, the duration in the thumbnail
  corner, the faded and struck-through rejected cut, the R key's delete dialog
  (focus moving to the next row, or back to the row on cancel), the selection
  border and checkbox, and the thumbnail gradient. Each now has a test, and
  24 mutations of those rules all fail it. No behavior changed (D-878).
- **Every rule of the "one concept, one icon" check proves it can fail.** A
  broken rule pattern (one extra letter, a lost case flag) matched nothing and
  passed in silence. Each rule now names one real app label per path of its
  pattern, and a test requires each label to exist and to match: 30 broken
  patterns all fail it. The check moved its rules and code reader to a helper
  file, so the next rule fits under the 500-line limit (D-889).

### Fixed
- **"Publicar sozinho" on TikTok no longer publishes by surprise.** The
  switch now turns off whenever the TikTok dialog closes — it used to stay on,
  and each cut's "Assistido" button, which always stopped before publishing,
  then published without saying so. While it is on, that button reads
  "Publicar com o robô". If the robot clicked Publish and the page did not
  confirm, the tab now comes back on screen and stays watched (the cut marks
  itself once the post shows up), and the row says so instead of a raw error.
  While a cut's tab is being watched, sending it again is refused by the
  server, so a second click cannot post the same video twice. Each single
  send now tags its tab, as the batch does: the watch looks at that tab only,
  and can no longer mark a cut from someone else's upload tab (D-893).
- **The batch no longer publishes the same video twice when TikTok does not
  confirm.** When the robot clicked Publish and the page did not leave the
  upload screen, the batch marked the item as an error: nobody watched the
  tab, the robot's window stayed hidden and the cut was never marked, so the
  next "Subir todos" with "Publicar sozinho" posted it again. The item now
  reads "conferir" (with a "saiu no ar" button), its own tab is watched and the
  cut marks itself once the post shows up, the window comes back on screen,
  and a new batch skips that cut while the tab is being checked. Cancelling
  the batch no longer stops that check (D-894).
- **Tagging a release finds the squash-merged release commit.** GitHub's
  squash merge ends the subject with " (#N)", so `release.ps1 -Taguear` never
  found the release commit on `main` and refused to tag. It now accepts that
  suffix (and nothing else after the subject). The tag summary also skips the
  "* <subject>" line GitHub puts first in a multi-commit squash body, refuses
  a body that starts with a trailer instead of tagging with a wrong summary,
  and `-Taguear -Resumo "..."` sets the summary by hand (D-891).
- **Editor keys no longer act behind an open dialog.** With the shortcuts
  help, the metadata or any other dialog or menu over the editor, A still
  approved the cut behind it, R asked to delete it, F toggled Fire and Space
  played the video (and swallowed the press on the dialog's own button). Keys
  without Ctrl now belong to whatever is open, the same rule the shell
  already used for J, K and Enter; Ctrl+S still saves, and W still closes
  the "why" dialog it opened, but no longer opens it on top of another one
  (D-887).
- **A console hiccup no longer takes the whole app down.** `dev.ps1` let
  every service inherit its console as input, and the Remotion Studio reads
  it as a keyboard; when that read failed ("read UNKNOWN"), the Studio
  crashed and the launcher, which stops everything when one service dies,
  took the backend, the frontend and the worker with it. The services now
  get a silent pipe from the launcher instead of the console (D-885).
- **Deleting a cut with an unsaved adjustment no longer traps the editor.**
  The way out tried to save the adjustment into the deleted cut, got 404,
  said "Não consegui salvar os ajustes" and stayed on a "Not Found" screen —
  for good, since nothing cleared the adjustment. Now deleting discards it,
  and if saving on the way out finds the cut gone (deleted here or on
  another screen), the editor says so and lets you leave (D-883).
- **"CI ok" no longer turns green when GitHub cancels the other jobs.** When
  no hosted runner picked up four jobs, GitHub cancelled them and the step
  meant to fail the check was skipped: a step condition without a status
  function gets an implicit `success()`, and in that run it was false. The
  step now always runs and passes only when every job it waits for ended in
  success (D-881).
- **Switching lives no longer shows the new list under the old live's title
  and footer.** The screen handed its title and footer to the app frame only
  after the browser had painted, so for a frame or more the Workspace of the
  new live showed the previous one's title and its "Aprovar os 6 propostos"
  (measured on 10 of 10 switches). Every screen now hands them over in the
  same render, so the frame and the screen arrive together (D-880).
- **The "out of sync" warning no longer covers the top bar.** It floated
  over the first 31 px of the window, so right after a pull or an update,
  before the restart, the search, the theme switch, the "Mais" menu and the
  actions of the dense screens did not take clicks. It now takes its own row
  and pushes the app down; the footer still fits on screen (D-879).
- **The theme checks no longer time out on a fresh checkout.** Two tests that
  read every frontend source file (the accent as a selection color, and the
  old StatusChip import) did that reading inside the test, under the 5 s
  limit; on a cold disk one took 5.6 s. The reading now happens when the suite
  loads, as in the emoji check, and the tests only compare (D-875).
- **The cut switcher's list opens again on the dense screens.** On the
  editor, Pós and Revisão, with the window too narrow for the side column,
  clicking the switcher in the top bar opened nothing: the bar cut off
  whatever hung below its 44 px, so the list was there but invisible. The bar
  now trims only sideways (its row is wider than the bar and must not
  scroll), and menus opened from it show in full (D-876).
- **The top bar of the dense screens keeps every button within reach.** On
  the editor, Pós and Revisão the screen's actions move up into the top bar,
  and at 1100 px the row was wider than the bar: the trail shrank to nothing,
  "Excluir corte" was cut and the search, queue and theme buttons sat off
  screen (keyboard focus landed there too). The cut switcher now has a
  maximum width, and when the bar is still short it gives way in steps,
  measuring itself: first the subtitle, then the channel name (the icon
  stays), then the screen's actions fold into a "⋯ Mais" menu. Search, status,
  queue and theme never leave (D-877).
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
- **Diarization and the dev tools install side by side.** The diarization
  lock was compiled only against the main one and pinned `filelock` 3.32.4
  while the dev lock pins 4.0.5, so `bin\bootstrap.ps1 -Dev -Diarizacao`
  downgraded it and the lock check of the test suite could never pass. The
  diarization lock is now compiled against the dev lock too, and a test fails
  if any two locks pin a shared package differently (D-892).
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
- **source-map-js 1.2.2.** Closes GHSA-68fv-2mgg-jv7q (high): crafted
  source-map section offsets could stall the event loop. It comes in only at
  build time, in the frontend and the renderer, and the new advisory had
  turned `main` red through the npm audit gate (D-882).
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

[Unreleased]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Paulo-Marcos/gerador-cortes/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Paulo-Marcos/gerador-cortes/releases/tag/v0.1.0
