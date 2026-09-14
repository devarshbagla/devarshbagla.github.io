/**
 * Virtual filesystem for the terminal. Plain nested objects, no I/O.
 * Directories hold `children`; files hold a `body` string.
 */

const file = (body) => ({ type: "file", body: body.trim() });
const dir = (children) => ({ type: "dir", children });

export const ROOT = dir({
  about: dir({
    "bio.md": file(`
Devarsh Bagla — Waltham, MA and Kolkata, India.

Computer Science and Economics at Brandeis, class of 2030, with a finance
minor. I build small tools for problems that annoy me, and most of them are
unfinished. The one that is not is bees.in: a site I designed and shipped end
to end for a wealth management firm in Kolkata that had spent twenty-five years
on word of mouth with nothing online.

The part I care about more than either the shipping or the research is
teaching. Fifteen students, a full academic year, open to anyone rather than CS
students only, building whatever they wanted instead of a syllabus.
`),
    "now.md": file(`
Learning CAD so I can design the parts I print instead of downloading them.

Running local language models on integrated graphics because I do not own a
discrete GPU: Qwen and Gemma through LM Studio on an Intel Arc iGPU, with
remote access from my phone. Setting up local image generation on the same
card.

Reading about how far you can push consumer hardware before it stops being
worth it.
`),
    "stack.md": file(`
LANGUAGES    Python, Java, JavaScript, HTML/CSS
AI TOOLING   Claude Code, Cursor, Claude Projects, Antigravity, LM Studio
ML AND DATA  WEKA, SMOTE, grid search, k-fold CV
WEB          Vercel, DNS, browser extensions
HARDWARE     ESP32, WLED, soldering, FDM 3D printing, Prusa Mini+, AV systems
SYSTEMS      Ubuntu Server, Docker, Tailscale

Honest depth notes live on the STACK section of the site. Hover any chip.
`),
    "colophon.md": file(`
Hand-written HTML, CSS and vanilla JavaScript ES modules.
No framework, no bundler, no npm, no build step.

Served by GitHub Pages straight out of the repository.
Run \`credits\` for who wrote what.
`),
  }),

  projects: dir({
    "deskpulse.md": file(`
DeskPulse — PROTOTYPE — Web Audio, DSP, accessibility

Laptops have no vibration motor, so a notification is either audible or
invisible. DeskPulse fires short bass-heavy bursts below hearing range through
the speakers, driving the voice coil hard enough that the chassis itself
vibrates. Auto-triggers on notifications, calls, new email and errors.

Usable in a silent library, and by anyone who cannot rely on audio cues.
The playground on this site runs the real synthesis: try \`open /#projects\`.
`),
    "lizi.md": file(`
LIZI — IN DEVELOPMENT — voice UI, local LLM, Windows

A voice assistant for my laptop. Recognises my voice, changes system settings,
sends email, and routes anything complicated to language models running
locally rather than a cloud API.

Built because I was used to Gemini on a tablet and Siri on a phone, and it
always bothered me that my laptop could not do the same after Cortana died.
`),
    "snapback.md": file(`
SnapBack — IN DEVELOPMENT — Chrome extension, context triggers

I do not set reminders, I leave tabs open and come back to them. RAM is
expensive and my laptop can only take so much.

SnapBack snoozes entire tab groups and brings them back on a trigger: arriving
at a location, a calendar event starting, or a date being reached.
`),
    "desktop-task-manager.md": file(`
Desktop Task Manager — IN DEVELOPMENT — Windows shell, WorkerW, C#

A task list drawn directly into the Windows desktop layer, behind the icons,
using WorkerW. That is undocumented Windows shell behaviour, which is most of
why I wanted to build it. Includes a live countdown strip in the taskbar.
`),
    "agentic-workflow.md": file(`
Agentic Workflow — SHIPPED — methodology, Cursor, context design

Not software, a method. Every project I run carries three files: one recording
where the work actually stands, one telling an agent how this specific project
is structured and what not to touch, and a scoped rules file.

A session that dies at 2am gets picked up cold the next morning without
re-explaining the codebase. My problem was never writing code, it was
abandoning things at sixty percent, and the cost was all in rebuilding context.
`),
    "chess-coach.md": file(`
Chess Coach — IN DEVELOPMENT — IndexedDB, web workers

A browser chess coach that plays you, reviews your moves and tracks
improvement. Rebuilt the storage layer so games survive a refresh, and moved
the engine's move search onto a background thread so the board stopped freezing
while it calculated.
`),
    "from-dust-to-zenith.md": file(`
From Dust to Zenith — SHIPPED — Vercel, DNS

An editorial publication site, built and deployed on Vercel with DNS configured
through GoDaddy, followed by a full UI audit and fixes.

https://fromdusttozenith.in
`),
    "casio-fx-cg50.md": file(`
Casio fx-CG50 Replica — PROTOTYPE — spec to app

A working replica of a graphing calculator, rebuilt from its specification.
`),
    "rapidread.md": file(`
RapidRead — IN DEVELOPMENT — RSVP, React Native, Expo, Android

A speed reading app built on RSVP, rapid serial visual presentation, where
words are flashed one at a time at a fixed point so your eyes never move.
Eliminating saccades is most of what makes reading slow. Android first,
because that is what I own. It is the one thing I am building in public.

https://github.com/devarshbagla/Rapidread
`),
    "fluentflyout.md": file(`
FluentFlyout — CONTRIBUTING — Open Source, C#, WPF, Windows 11

An open-source media and volume flyout for Windows 11 built on Fluent 2
design. I forked it to add scroll and gesture control for volume. First time
working inside a codebase I did not write, to someone else's conventions,
which is a completely different skill from starting from an empty folder.

https://github.com/devarshbagla/FluentFlyout
`),
    "minecraft-progression-mod.md": file(`
Minecraft Progression Mod — IN DEVELOPMENT — Java, Game Design, Systems

Most players quit Minecraft in the first few hours because nothing tells them
what to do next. A mod with a 331-entry adaptive goal system that reads your
world seed and current progress and suggests the next thing worth doing, so
the open world stops being paralysing.
`),
    "homelab.md": file(`
Homelab — IN DEVELOPMENT — Ubuntu, Docker, Tailscale, Self-hosting

A self-hosted stack in Kolkata: Ubuntu Server, Tailscale for mesh networking,
Immich for photo backup, AdGuard Home for DNS filtering, Home Assistant,
Portainer, Uptime Kuma. Built so I can reach my own data from another
continent without paying anyone a subscription for the privilege.
`),
    "local-inference.md": file(`
Local Inference — SHIPPED — LM Studio, Intel Arc, Quantisation

Running language models locally on an Intel Arc integrated GPU, because I do
not own a discrete card. Qwen 3.5 9B and Gemma 4 12B Instruct through LM
Studio, with LM Link and the Locally iOS app so I can reach them from my phone.
Currently adding SD.Next on the IPEX backend for local image generation on the
same chip. The constraint is the interesting part: everyone doing this has a
4090.
`),
    "bees-in.md": file(`
bees.in — SHIPPED — sole developer, 2 months, live in production

BEES Network Ltd, Kolkata. A financial planning firm that had operated for
twenty-five years entirely on in-person referrals with no web presence.

Built end to end: information architecture, layout, copy, build, deployment
and DNS. Delivered iteratively, shipping features one at a time rather than as
a single launch. Plain HTML and CSS, no framework, AI-assisted workflow.

https://bees.in
`),
  }),

  research: dir({
    "churn-paper.md": file(`
Deep Learning Approaches for Churn Prediction:
An Empirical Evaluation on Real-World Business Datasets

Bagla, D. (2025). International Journal of Scientific Engineering and
Research, 13(10). Sole author.

DOI: 10.70729/SE251005174007
PDF: https://www.ijser.in/archives/v13i10/SE251005174007.pdf
`),
    "method.md": file(`
Dataset: 64,374 records, 12 attributes.

Preprocessing
  mean and mode imputation
  one-hot encoding
  min-max normalisation
  IQR-based outlier handling
  SMOTE oversampling to correct class imbalance

Feature selection ran three independent ways
  correlation-based selection, best-first search, 72 subsets, merit 0.621
  classifier attribute evaluator with ranker
  CfsSubsetEval with greedy stepwise

All three converged on the same ten attributes. Recency of last interaction
was the strongest single predictor.

Tuning: grid search under ten-fold cross-validation. Tooling: WEKA.
`),
    "results.txt": file(`
MODEL                  ACC    PREC   REC    F1     ROC-AUC
Logistic Regression    83.6   81.9   77.2   79.5   84.3
Random Forest          90.3   88.7   87.9   88.1   91.8
Deep Neural Network    94.1   93.2   91.4   92.3   95.7

Random forest: 200 trees.
DNN: 3 hidden layers, ReLU, 0.3 dropout, Adam.
`),
  }),

  teaching: dir({
    "bytebuilders.md": file(`
2025-2026 — Mentor, ByteBuilders — 15 students, ~72 contact hours

My school's computer club, open to any student rather than only those taking
CS. Two hours a week across a full academic year, working from whatever each
person actually wanted to build instead of a syllabus. Several of them had
never written a line of code.

What I took from it: people stay when they are building their own idea, and
leave the moment it becomes a lecture.
`),
    "fueladream.md": file(`
2024-2025 — Campaign lead, FuelADream x Go Girl Foundation
290% of target, 52 funders

Founded and ran a crowdfunding campaign distributing reusable sanitary pads to
girls and women in rural Rajasthan. No institutional backing, no mailing list,
no existing audience. Most gifts came in at a few dollars each, so it was 52
separate conversations and follow-ups rather than a handful of large
donations. I travelled to the schools and handed the products over myself.

https://www.fueladream.com/home/campaign/73792
`),
    "av-squad.md": file(`
2021-2024 — Secretary, Audio-Visual Squad, The Scindia School
30+ events, team of 5

Three years from member to Joint Secretary to Secretary. Led a five-person
technical team running sound, lighting and projection for daily assemblies and
more than thirty major events, including inter-school festivals with outside
performers and audiences of several hundred.

Most of what I learned was about failure: late vendors, microphones dying
mid-performance, cues changing during the show.
`),
    "bhind.md": file(`
2023 — School renovation, Bhind, Madhya Pradesh

One week with roughly a hundred classmates rebuilding a rural government
primary school serving around a thousand children. Hand-mixed cement,
bricklaying, foundations and painting, in temperatures near 45C.
`),
    "tutoring.md": file(`
Private tutor, Computer Science — Independent, Jaipur
3 months, IGCSE, 1 student

Taught IGCSE Computer Science, focused on pseudocode and algorithmic problem
solving. Took a student from no prior programming exposure to independently
solving IGCSE pseudocode problems.
`),
  }),

  before: dir({
    "ib-diploma.md": file(`
Two years, six subjects, three at Higher Level. Mine were Computer Science,
Economics and Mathematics Analysis and Approaches AI, with English, Business
Management and French ab initio at Standard Level.

The Mathematics internal assessment was a used-car resale pricing model built
with polynomial regression: collecting the data myself, choosing the degree,
and then spending most of the write-up on why a higher-degree fit that looked
better was actually worse. That was the first time overfitting stopped being
a word in a textbook.

Computer Science HL is what got me eight credits of advanced standing at
Brandeis, so I started a year ahead of the standard sequence.

HL COMPUTER SCIENCE · HL ECONOMICS · HL MATHEMATICS AI · 8 CREDITS OF ADVANCED STANDING
`),
    "scindia.md": file(`
Three years at a residential boarding school in Gwalior, grades 8 to 10. It
ran on assemblies, inter-school festivals and stage events, which is where
almost everything else on this page comes from.

I learned the harmonium there and kept at it for three years. Classical ragas,
performed on stage for audiences of six hundred students across more than
fifteen events, plus intra-school competitions I won a few of. I hold
certificates in both harmonium and vocal performance. What it actually taught
me was narrower than music: I kept failing one fast passage while playing the
rest cleanly, and the fix was to stop drilling the passage and start listening
to the whole piece. Most of my debugging works the same way now.

I also placed second in English Debate and second in English Elocution. That
is the only formal training I have in arguing a position out loud, and it has
been more useful than it sounds.

And I did woodworking every week for three years, which has no undo button. A
palm-sized owl, a wooden fish, a nameplate, a tribal mask, and a Ganesha
holding a modak in his trunk. Chisel, then the sander, then hours of
sandpaper. It is where I learned what finished actually feels like.

3 YEARS HARMONIUM · 15+ PERFORMANCES · 600+ AUDIENCE · 2ND, ENGLISH DEBATE · 2ND, ENGLISH ELOCUTION · 3 YEARS WOODWORKING
`),
    "finance.md": file(`
Finance 101 through NSE Academy, the National Stock Exchange of India's
education arm, run with Empirical Academy. Ten hours, self-paced: primary and
secondary markets, IPO mechanics, how stock indices are actually constructed
(market-cap weighted versus price weighted versus equally weighted), and the
time value of money.

The useful part was the NSE Smart simulator, where you build and hold a
portfolio rather than answer questions about one. It is an introductory course,
not a professional credential, but it is why the finance minor made sense.

NSE ACADEMY · 10 HOURS · PORTFOLIO SIMULATION
`),
  }),

  "off-the-clock": dir({
    "swimming.md": file(`
Calcutta Swimming Club, now the Brandeis Swim Club. The only thing I do that
has nothing to do with a screen.
`),
    "games.md": file(`
Call of Duty Mobile, ranked multiplayer, top 2% globally. Also Minecraft,
Valorant, Frostpunk, Overcooked 2, Clash Royale and actual chess. The range is
deliberate: competitive FPS, survival strategy, sandbox, forced co-op and
real-time strategy all break in different ways. I am taking Designing and
Analyzing Games this semester, which is the first time anyone has asked me to
write down why.
`),
    "drawing.md": file(`
Observational sketching, drawing objects from life, plus light digital work.
It is the front end of the loop in the Workbench section: if you can record a
form accurately you can model it, and if you can model it you can print it.
`),
    "languages.md": file(`
English, Hindi and Bengali fluently. French badly but improving. Kolkata and
Jaipur growing up, Waltham now.
`),
  }),

  contact: dir({
    "email.txt": file(`
devarshbagla@gmail.com

Email is the fastest way to reach me. I am most interested in
hardware-adjacent software, AI tooling, and anything that involves teaching
people to build.
`),
    "links.txt": file(`
github     https://github.com/devarshbagla
linkedin   https://www.linkedin.com/in/devarshbagla
paper      https://dx.doi.org/10.70729/SE251005174007
bees       https://bees.in
dust       https://fromdusttozenith.in

Try: open github
`),
  }),
});

/** Resolve a path string against a cwd array. Returns a segment array or null. */
export function resolvePath(cwd, input) {
  const raw = (input || "").trim();
  let segments;
  if (raw === "" || raw === "~") segments = [];
  else if (raw.startsWith("/")) segments = raw.slice(1).split("/");
  else if (raw.startsWith("~/")) segments = raw.slice(2).split("/");
  else segments = [...cwd, ...raw.split("/")];

  const out = [];
  for (const part of segments) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out;
}

export function nodeAt(segments) {
  let node = ROOT;
  for (const part of segments) {
    if (node.type !== "dir") return null;
    const next = node.children[part];
    if (!next) return null;
    node = next;
  }
  return node;
}

export function formatPath(segments) {
  return segments.length ? `/${segments.join("/")}` : "/";
}

export function listDir(node) {
  if (!node || node.type !== "dir") return [];
  return Object.keys(node.children).sort((a, b) => {
    const aDir = node.children[a].type === "dir";
    const bDir = node.children[b].type === "dir";
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.localeCompare(b);
  });
}

export function countFiles(node = ROOT) {
  if (node.type === "file") return 1;
  return Object.values(node.children).reduce((sum, child) => sum + countFiles(child), 0);
}
