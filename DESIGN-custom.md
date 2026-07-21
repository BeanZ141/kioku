# DESIGN-custom.md

Reusable design system extracted from `D:\fitness` project.

This guide captures the page style as a portable design pattern for serious B2B reports, feasibility memos, market research pages, investor-style recommendations, audit reports, and long-form strategic documents.

## 1. Design Intent

The design is a dark-first, editorial B2B report interface. It feels closer to an investment memo, analyst note, or board document than a marketing page.

Use this design when the page should feel:

- sober
- high-trust
- evidence-led
- concise
- senior
- research-heavy
- low-decoration
- easy to scan over a long reading session

Avoid using this style for:

- playful consumer landing pages
- image-heavy portfolios
- casual blogs
- product pages that need warmth or emotional storytelling
- dashboards that require dense controls and repeated actions

The core visual idea is:

> A restrained research memo with a persistent table of contents, strong typographic hierarchy, hairline dividers, collapsible evidence sections, and no decorative cards.

## 2. Personality

The interface should communicate:

- "This analysis is serious."
- "The content is the product."
- "Every section has a verdict."
- "You can skim, then dive."
- "Nothing decorative is competing with the argument."

The tone is intentionally plain. Most of the authority comes from spacing, typography, structure, and confident restraint.

## 3. Page Anatomy

The original page is organized like this:

```html
<body>
  <button class="theme-toggle theme-toggle-desktop">Light</button>

  <div class="topbar">
    <div class="mark"><b>Report title</b> - Report category</div>
    <div class="topbar-actions">
      <button class="theme-toggle">Light</button>
      <button class="navtoggle">Contents</button>
    </div>
  </div>

  <div class="backdrop"></div>

  <div class="shell">
    <nav class="toc">
      <!-- grouped page navigation -->
    </nav>

    <main>
      <section class="hero">
        <!-- eyebrow, h1, dek, meta -->
      </section>

      <div class="kpis">
        <!-- 3 headline metrics -->
      </div>

      <div class="source-note">
        <!-- evidence labeling system -->
      </div>

      <details>
        <summary>
          <span class="q">Q1</span>
          <h2>Section question</h2>
        </summary>
        <div class="content">
          <!-- verdict, prose, cards, tables, timelines -->
        </div>
      </details>

      <section class="final">
        <!-- final recommendation -->
      </section>
    </main>
  </div>
</body>
```

## 4. Design Principles

### 4.1 Content First

Do not decorate the page to make it feel designed. Let the content structure carry the design:

- strong title
- short executive summary
- clear metadata
- grouped navigation
- numbered sections
- verdict-first content blocks
- tables for comparisons
- timelines for process
- final recommendation

### 4.2 Hairlines Instead Of Boxes

The page avoids normal cards. Instead, it uses:

- border-bottom separators
- border-left verdict marks
- vertical rules between columns
- table row dividers
- grouped navigation spacing

This keeps the page serious and prevents visual noise.

### 4.3 Monochrome Authority

The source design is almost entirely monochrome. It does not rely on colored status badges.

Verdicts like `yes`, `warn`, and `no` are semantic classes, but visually they all use the same neutral border. This makes the report feel less like a dashboard and more like analysis.

### 4.4 Progressive Disclosure

Long reports should not expose everything at once. Use native `details` and `summary` sections for each major question or chapter.

Recommended pattern:

- Executive summary is visible immediately.
- KPI or thesis strip is visible immediately.
- Most detailed sections are collapsed.
- First section can be open by default.
- Final recommendation is visible near the bottom.

### 4.5 Desktop Reading, Mobile Access

Desktop gets a sticky left table of contents. Mobile gets a sticky top bar and slide-in contents drawer.

This makes the report usable both as:

- a deep desktop reading document
- a mobile reference document

## 5. Design Tokens

Use CSS variables so the same page can switch between dark and light themes.

```css
:root {
  --font: "SF Pro", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --radius: 0px;
  --topbar-h: 52px;
}

html[data-theme="dark"] {
  --bg: #000000;
  --text: #f5f5f5;
  --text-2: #d9d9d9;
  --muted: #98989d;
  --faint: #6e6e73;
  --line: #1d1d1d;
  --line-2: #3a3a3c;
}

html[data-theme="light"] {
  --bg: #fafafa;
  --text: #1d1d1f;
  --text-2: #454545;
  --muted: #6e6e73;
  --faint: #86868b;
  --line: #d2d2d7;
  --line-2: #b8b8bd;
}
```

### Token Roles

| Token | Purpose |
| --- | --- |
| `--bg` | Page background |
| `--text` | Primary text and strong links |
| `--text-2` | Secondary heading text |
| `--muted` | Supporting body copy, labels, notes |
| `--faint` | Eyebrows, table headers, section numbers |
| `--line` | Subtle separators |
| `--line-2` | Stronger separators and focus lines |
| `--topbar-h` | Mobile sticky bar height |
| `--radius` | Kept at `0px` to preserve the editorial memo style |

## 6. Typography

### Font Stack

Use a system sans stack with Apple-like rendering:

```css
font-family: "SF Pro";
```

### Global Text Rules

```css
body {
  font-weight: 400;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

### Type Scale

| Element | Desktop | Mobile | Weight | Notes |
| --- | ---: | ---: | ---: | --- |
| `h1` | 38px | 27-30px | 500 | Tight, serious report title |
| `.dek` | 18px | 18px | 400 | Muted executive summary |
| `summary h2` | 19px | 19px | 500 | Question or section title |
| `h3` | 15px | 15px | 500 | Subsection heading |
| `h4` | 14px | 14px | 500 | Small component heading |
| `p`, `li` | 15.5px | 15.5px | 400 | Main reading text |
| `.small` | 14px | 14px | 400 | Notes and confidence text |
| `.toc a` | 14px | 14px | 400 | Navigation links |
| `.eyebrow`, `th` | 11-12px | 11-12px | 500 | Uppercase labels |

### Letter Spacing

The source uses tight letter spacing on large titles and KPI numbers:

```css
h1 {
  letter-spacing: -2px;
}

.kpi .num {
  letter-spacing: -2px;
}
```

For future pages, use this carefully. If the page has longer words, technical terminology, or multilingual content, reduce to `-1px` or `0`.

## 7. Layout System

### Desktop Shell

```css
.shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 64px;
  max-width: 1320px;
  margin: 0 auto;
  padding: 56px 32px 40px;
}

main {
  max-width: 1000px;
  min-width: 0;
}
```

Layout meaning:

- `240px` left rail for navigation
- `64px` breathing room between nav and content
- `1000px` content max width for tables
- centered total shell at `1320px`
- enough top padding for a desktop report feel

### Mobile Shell

```css
@media (max-width: 860px) {
  .shell {
    display: block;
    padding: 0 24px 24px;
    gap: 0;
  }
}
```

Breakpoint behavior:

- above `860px`: sticky left navigation
- at or below `860px`: mobile top bar plus slide-in navigation
- at or below `640px`: tables become stacked rows

## 8. Navigation

### Desktop TOC

The table of contents is sticky and grouped.

```css
.toc {
  position: sticky;
  top: 40px;
  align-self: start;
  height: calc(100vh - 80px);
  overflow: auto;
  scrollbar-width: thin;
}

.navgroup {
  margin-bottom: 22px;
}

.navgroup h3 {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--faint);
  font-weight: 500;
  margin: 0 0 8px;
}

.toc a {
  display: block;
  color: var(--muted);
  font-size: 14px;
  padding: 5px 0;
  border: none;
}

.toc a.active,
.toc a:hover {
  color: var(--text);
}
```

### Recommended TOC Grouping

Group navigation by decision logic, not by equal section count.

Example:

```html
<nav class="toc" id="toc">
  <div class="toc-head">Contents</div>

  <div class="navgroup">
    <a href="#exec">Executive summary</a>
  </div>

  <div class="navgroup">
    <h3>Market and demand</h3>
    <a href="#q1">1. Pain</a>
    <a href="#q2">2. Competitors</a>
    <a href="#q3">3. Saturation</a>
  </div>

  <div class="navgroup">
    <h3>Build and risk</h3>
    <a href="#q4">4. Implementation</a>
    <a href="#q5">5. Regulation</a>
  </div>

  <div class="navgroup">
    <a href="#sources">Sources</a>
  </div>
</nav>
```

### Mobile Top Bar

Mobile replaces the fixed visual presence of the desktop TOC with a compact sticky bar.

```css
.topbar {
  display: none;
}

@media (max-width: 860px) {
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    position: sticky;
    top: 0;
    z-index: 40;
    height: var(--topbar-h);
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
  }
}
```

### Mobile Drawer

```css
@media (max-width: 860px) {
  .toc {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: min(300px, 84vw);
    background: var(--bg);
    border-right: 1px solid var(--line);
    padding: 24px;
    z-index: 70;
    transform: translateX(-100%);
    transition: transform .25s ease;
    overflow-y: auto;
  }

  .toc.open {
    transform: translateX(0);
  }

  .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .4);
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
    z-index: 65;
  }

  .backdrop.open {
    opacity: 1;
    pointer-events: auto;
  }
}
```

## 9. Hero Pattern

The hero is not a marketing hero. It is an executive memo header.

```html
<section class="hero" id="exec">
  <div class="eyebrow">Investment memo style feasibility report - India - July 2026</div>
  <h1>Healthcare SaaS for medicine tracking, reminders, prescriptions and discharge follow-up</h1>
  <p class="dek">
    A blunt assessment for a bootstrapped three-founder engineering team...
  </p>
  <div class="meta">
    <div><span>Verdict</span><strong>Do not build as scoped</strong></div>
    <div><span>Best wedge</span><strong>Specialty follow-up workflow</strong></div>
    <div><span>Confidence</span><strong>Medium-high</strong></div>
    <div><span>Evidence mix</span><strong>Official docs, vendor pages, market signals</strong></div>
  </div>
</section>
```

```css
.hero {
  padding-bottom: 36px;
  margin-bottom: 36px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  color: var(--faint);
  font-weight: 500;
  margin-bottom: 18px;
}

h1 {
  font-size: 38px;
  line-height: 1.15;
  font-weight: 500;
  margin: 0 0 18px;
  max-width: 820px;
  letter-spacing: -2px;
}

.dek {
  font-size: 18px;
  line-height: 1.5;
  color: var(--muted);
  max-width: 720px;
  margin: 0 0 30px;
  font-weight: 400;
}
```

### Hero Rules

- The H1 should be literal and specific.
- The eyebrow should explain document type, geography, date, or audience.
- The dek should state the core conclusion, not tease it.
- Avoid images in this pattern unless the report topic truly needs visual evidence.
- Keep the hero unboxed.

## 10. Metadata Strip

Use metadata to summarize the document's decision posture.

```css
.meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  margin-top: 8px;
}

.meta div {
  padding: 0 20px 0 0;
}

.meta div + div {
  border-left: 1px solid var(--line);
  padding-left: 20px;
}

.meta span {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--faint);
  margin-bottom: 6px;
}

.meta strong {
  font-size: 14.5px;
  font-weight: 500;
}
```

Good metadata labels:

- Verdict
- Best wedge
- Confidence
- Evidence mix
- Audience
- Time horizon
- Region
- Risk level
- Recommendation
- Scope

## 11. KPI Strip

The KPI strip is a sparse credibility block. It should contain 3 numbers or short claims.

```html
<div class="kpis">
  <div class="kpi">
    <div class="num">24</div>
    <div class="label">Questions answered from research brief</div>
  </div>
  <div class="kpi">
    <div class="num">6-12 mo</div>
    <div class="label">Likely institutional sales cycle</div>
  </div>
  <div class="kpi">
    <div class="num">Low</div>
    <div class="label">Chance of repeatable SaaS without tighter wedge</div>
  </div>
</div>
```

```css
.kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 0 0 40px;
  padding-bottom: 32px;
  border-bottom: 1px solid var(--line);
}

.kpi {
  padding: 0 24px;
}

.kpi + .kpi {
  border-left: 1px solid var(--line);
}

.kpi .num {
  font-size: 30px;
  font-weight: 500;
  letter-spacing: -2px;
}

.kpi .label {
  font-size: 14px;
  color: var(--muted);
  margin-top: 6px;
}
```

KPI rules:

- Use exactly 3 when possible.
- Keep values short.
- Use labels to explain the metric.
- Avoid bright status colors.
- Do not put KPIs inside cards.

## 12. Evidence Note And Tags

The source page uses inline tags separated by hairlines, not pill badges.

```html
<div class="source-note">
  Evidence labels used below:
  <span class="tag">Government / regulator</span>
  <span class="tag">Vendor page</span>
  <span class="tag">Market signal</span>
  <span class="tag">Customer review</span>
</div>
```

```css
.source-note {
  color: var(--muted);
  font-size: 15px;
  margin: 0 0 40px;
  line-height: 1.6;
}

.tag {
  display: inline;
  color: var(--muted);
  font-size: 14px;
  padding-right: 10px;
  margin-right: 10px;
  border-right: 1px solid var(--line);
}

.tag:last-child {
  border-right: none;
}
```

Use this for:

- evidence categories
- source categories
- customer segments
- risk categories
- report filters that do not need interaction

Avoid pill-shaped badges. They make the page feel more like SaaS UI and less like a memo.

## 13. Accordion Sections

Each major report section is a native `details` block.

```html
<details id="q1" open>
  <summary>
    <span class="q">Q1</span>
    <h2>Is this actually a painful problem?</h2>
  </summary>
  <div class="content">
    <div class="verdict warn">
      <b>Verdict: real clinical pain, weak standalone purchasing pain.</b>
      Medication adherence and follow-up are real problems...
    </div>
    <p>Body content...</p>
  </div>
</details>
```

```css
details {
  border: none;
  border-bottom: 1px solid var(--line);
  margin: 0;
  overflow: hidden;
}

summary {
  cursor: pointer;
  list-style: none;
  padding: 22px;
  display: flex;
  gap: 16px;
  align-items: center;
}

summary::-webkit-details-marker {
  display: none;
}

summary::after {
  content: "+";
  margin-left: auto;
  font-size: 18px;
  font-weight: 400;
  color: var(--faint);
}

details[open] summary::after {
  content: "-";
}

.q {
  font-size: 12px;
  color: var(--faint);
  font-weight: 500;
  min-width: 34px;
}

summary h2 {
  font-size: 19px;
  line-height: 1.3;
  font-weight: 500;
  margin: 0;
  color: var(--text-2);
}

details:hover summary {
  background-color: #121212;
}

details:hover .q,
details:hover h2 {
  color: var(--text);
}

.content {
  padding: 0 0 30px;
}
```

### Accordion Rules

- Put the question or section title in `summary h2`.
- Put the identifier in `.q`, such as `Q1`, `SRC`, `A1`, or `R3`.
- Use `open` only for the first or most important section.
- Make the verdict the first element inside `.content`.
- Keep summary labels short enough for mobile.

## 14. Verdict Callouts

Verdicts are restrained left-border callouts.

```html
<div class="verdict no">
  <b>Verdict: crowded around the workflow.</b>
  The competition is not one direct clone...
</div>
```

```css
.verdict {
  padding: 2px 0 2px 18px;
  margin: 20px 0;
  border-left: 2px solid var(--line-2);
  font-size: 15.5px;
}

.verdict b {
  font-weight: 400;
}

.no,
.warn,
.yes {
  border-left-color: var(--line-2);
}
```

Semantic classes:

- `.yes` means favorable or possible
- `.warn` means mixed or conditional
- `.no` means unfavorable or high risk

Visual rule:

- Keep them visually identical unless the page truly needs color-coded urgency.
- In B2B strategy reports, neutrality often feels more credible than colored alerts.

## 15. Comparison Cards

The original page uses "cards" as plain two-column content blocks with a vertical divider. They are not boxed cards.

```html
<div class="cards">
  <div class="card">
    <h4>Evidence that the pain is real</h4>
    <ul>
      <li>Point one.</li>
      <li>Point two.</li>
    </ul>
  </div>
  <div class="card">
    <h4>Evidence that buying intent is weak</h4>
    <ul>
      <li>Point one.</li>
      <li>Point two.</li>
    </ul>
  </div>
</div>
```

```css
.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin: 16px 0;
}

.card {
  padding: 0 28px;
}

.card + .card {
  border-left: 1px solid var(--line);
}

.card:first-child {
  padding-left: 0;
}

.card h4 {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.card p,
.card li {
  font-size: 14px;
  color: var(--muted);
}
```

Use for:

- pro vs con
- evidence for vs evidence against
- current state vs recommendation
- risk vs mitigation
- buyer pain vs vendor opportunity

Do not add:

- shadows
- rounded corners
- backgrounds
- icon badges

## 16. Tables

Tables are central to the report style. They carry competitor analysis, risk matrices, assumptions, validation plans, and financial comparisons.

```css
table {
  width: 100%;
  border-collapse: collapse;
  margin: 18px 0 22px;
  font-size: 14px;
  color: var(--text);
}

th {
  font-weight: 500;
  color: var(--faint);
  text-align: left;
  text-transform: uppercase;
  font-size: 11px;
  border-bottom: 1px solid var(--line-2);
  padding: 10px 14px 10px 0;
}

td {
  border-bottom: 1px solid var(--line);
  padding: 12px 14px 12px 0;
  vertical-align: top;
}

tr:last-child td {
  border-bottom: 1px solid var(--line-2);
}
```

### Mobile Table Pattern

On small screens, convert rows into stacked labeled blocks.

```css
@media (max-width: 640px) {
  table,
  thead,
  tbody,
  tr,
  th,
  td {
    display: block;
  }

  thead {
    display: none;
  }

  tr {
    border-bottom: 1px solid var(--line-2);
    padding: 9px 0;
  }

  td {
    border: 0;
    padding: 5px 0;
  }

  td:before {
    content: attr(data-label);
    display: block;
    color: var(--faint);
    font-size: 10.5px;
    text-transform: uppercase;
  }
}
```

Each mobile table cell needs a `data-label`:

```html
<td data-label="Company">Example Vendor</td>
<td data-label="Pricing">Quote-led</td>
<td data-label="Strengths">Strong enterprise integrations</td>
```

## 17. Timeline Rows

Use timelines for sales cycles, implementation roadmaps, validation plans, or path-to-revenue sections.

```html
<div class="timeline">
  <div class="step">
    <b>0-30 days</b>
    <p>Interview buyers, validate the painful workflow, avoid writing production code.</p>
  </div>
  <div class="step">
    <b>30-90 days</b>
    <p>Pilot with one design partner and manually support the workflow.</p>
  </div>
</div>
```

```css
.timeline {
  display: flex;
  flex-direction: column;
  margin: 16px 0;
}

.step {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr);
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
}

.step:first-child {
  border-top: none;
}

.step b {
  font-weight: 500;
  color: var(--text);
}

.step p {
  font-size: 14.5px;
  color: var(--muted);
  margin: 0;
}

@media (max-width: 640px) {
  .step {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
```

## 18. Decision Tree

The decision tree is a vertical list with a single left rule.

```html
<div class="decision">
  <div><b>If buyer pain is vague:</b> do not build.</div>
  <div><b>If a department owns budget:</b> validate willingness to pay.</div>
  <div><b>If there is repeat usage:</b> consider a narrow product wedge.</div>
</div>
```

```css
.decision {
  border-left: 1px solid var(--line-2);
  margin: 18px 0 0 6px;
  padding-left: 20px;
}

.decision div {
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.decision div:last-child {
  border-bottom: none;
}
```

Use this when the reader needs a final go/no-go logic chain.

## 19. Final Recommendation

The final section should feel like a conclusion, not another card.

```html
<section class="final" id="final">
  <div class="eyebrow">Final recommendation</div>
  <h2>Do not build the broad platform.</h2>
  <p>Build only after validating a narrow workflow with budget ownership.</p>
</section>
```

```css
.final {
  border-top: 1px solid var(--line-2);
  padding: 36px 0 0;
  margin: 36px 0 60px;
}

.final h2 {
  font-size: 24px;
  font-weight: 500;
  margin: 0 0 16px;
  letter-spacing: -1px;
}
```

## 20. Theme Toggle

The page supports dark and light themes through `data-theme`.

```js
(function () {
  var root = document.documentElement;
  var toggles = [
    document.getElementById('themeToggleDesktop'),
    document.getElementById('themeToggleMobile')
  ];

  function labelFor(theme) {
    return theme === 'dark' ? 'Light' : 'Dark';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    toggles.forEach(function (btn) {
      if (btn) btn.textContent = labelFor(theme);
    });
  }

  var prefersDark = window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  applyTheme(prefersDark === false ? 'light' : 'dark');

  toggles.forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  });
})();
```

Recommended improvement for new pages:

- Store the user choice in `localStorage`.
- Respect system preference only on first load.
- Keep button labels as the destination theme, such as `Light` when currently dark.

## 21. Active TOC Highlighting

Use `IntersectionObserver` to highlight the active section.

```js
var toc = document.getElementById('toc');
var navLinks = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
var targets = navLinks.map(function (a) {
  return document.getElementById(a.getAttribute('href').slice(1));
}).filter(Boolean);

if ('IntersectionObserver' in window && targets.length) {
  var current = null;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) current = entry.target.id;
    });

    navLinks.forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  }, {
    rootMargin: '-15% 0px -70% 0px',
    threshold: 0
  });

  targets.forEach(function (target) {
    io.observe(target);
  });
}
```

## 22. Accordion Animation

The original page animates `details` open and close using the Web Animations API.

Use it when the page needs a polished reading experience, but keep the native `details` structure for accessibility.

Behavior:

- prevent default summary toggle
- measure collapsed height
- open details
- measure expanded height
- animate height
- clear inline height after animation
- optionally scroll opened section into view

Recommended duration:

```js
var DURATION = 350;
var EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
```

Avoid over-animating. This is a document, not an app transition showcase.

## 23. Responsive Rules

### Breakpoint: 980px

Reduce hero title size.

```css
@media (max-width: 980px) {
  h1 {
    font-size: 30px;
  }
}
```

### Breakpoint: 860px

Switch from desktop reading layout to mobile document layout.

```css
@media (max-width: 860px) {
  .shell {
    display: block;
    padding: 0 24px 24px;
  }

  h1 {
    font-size: 27px;
  }

  .hero {
    padding-top: 24px;
    padding-bottom: 28px;
    margin-bottom: 28px;
  }

  .meta,
  .kpis,
  .cards {
    grid-template-columns: 1fr;
  }

  .meta div + div,
  .kpi + .kpi,
  .card + .card {
    border-left: none;
    border-top: 1px solid var(--line);
    padding-left: 0;
    padding-top: 16px;
    margin-top: 16px;
  }

  .kpi,
  .card {
    padding: 0;
  }
}
```

### Breakpoint: 640px

Reduce accordion padding, stack tables, and collapse timeline rows.

```css
@media (max-width: 640px) {
  summary {
    padding: 18px 0;
  }

  .step {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
```

## 24. Accessibility Rules

Keep these from the source:

```css
html {
  scroll-behavior: smooth;
}

:is(section, details, .final)[id] {
  scroll-margin-top: 20px;
}

@media (max-width: 860px) {
  :is(section, details, .final)[id] {
    scroll-margin-top: calc(var(--topbar-h) + 12px);
  }
}

:focus-visible {
  outline: 1px solid var(--text);
  outline-offset: 2px;
}

::selection {
  background: var(--text);
  color: var(--bg);
}
```

Additional recommendations for future pages:

- Add `aria-expanded` to the mobile contents button.
- Close the mobile drawer when a nav link is clicked.
- Close the mobile drawer when the backdrop is clicked.
- Consider closing the drawer on `Escape`.
- Do not remove native `details` semantics.
- Give every TOC target a unique `id`.
- Add `data-label` to every mobile table cell.

## 25. Copywriting Pattern

The design depends on strong content structure. Use this writing pattern:

1. Start with a decisive executive summary.
2. Use factual, literal headings.
3. Put a verdict first in every section.
4. Separate evidence from interpretation.
5. Use tables for comparison-heavy content.
6. Use timelines for process-heavy content.
7. End with a final recommendation.

### Section Template

```html
<details id="q1">
  <summary>
    <span class="q">Q1</span>
    <h2>Plain-language decision question?</h2>
  </summary>

  <div class="content">
    <div class="verdict warn">
      <b>Verdict: short conclusion.</b>
      One sentence that explains the practical implication.
    </div>

    <p>Explain the context and evidence.</p>

    <table>
      <thead>
        <tr>
          <th>Factor</th>
          <th>Evidence</th>
          <th>Implication</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td data-label="Factor">Buyer urgency</td>
          <td data-label="Evidence">Low unless tied to revenue or compliance.</td>
          <td data-label="Implication">Avoid broad positioning.</td>
        </tr>
      </tbody>
    </table>

    <p class="small">Confidence: Medium-high.</p>
  </div>
</details>
```

## 26. What To Reuse On Other Pages

Reuse these parts directly:

- dark/light token system
- two-column shell
- sticky grouped TOC
- mobile top bar and drawer
- executive memo hero
- metadata strip
- KPI strip
- native details sections
- verdict callouts
- plain divider cards
- responsive tables
- timeline rows
- final recommendation section

Customize these per page:

- nav group labels
- hero eyebrow
- H1
- dek
- metadata fields
- KPI values
- section IDs
- evidence categories
- final recommendation

## 27. When Adapting To Other Domains

### SaaS Market Report

Use:

- Executive summary
- Buyer profile
- Market map
- Competitor table
- Pricing model
- Sales motion
- Risks
- Recommendation

### Startup Idea Validation

Use:

- Problem
- Customer
- Existing alternatives
- Willingness to pay
- MVP scope
- Distribution
- Risks
- Build/no-build verdict

### Vendor Comparison

Use:

- Executive summary
- Evaluation criteria
- Vendor table
- Strengths and weaknesses
- Implementation risk
- Pricing summary
- Recommendation

### Product Strategy Memo

Use:

- Current state
- Strategic options
- Customer evidence
- Revenue impact
- Technical complexity
- Roadmap
- Decision tree

## 28. Starter CSS

This is a compact starter version for new pages.

```css
:root {
  --font: "SF Pro", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
  --topbar-h: 52px;
}

html[data-theme="dark"] {
  --bg: #000;
  --text: #f5f5f5;
  --text-2: #d9d9d9;
  --muted: #98989d;
  --faint: #6e6e73;
  --line: #1d1d1d;
  --line-2: #3a3a3c;
}

html[data-theme="light"] {
  --bg: #fafafa;
  --text: #1d1d1f;
  --text-2: #454545;
  --muted: #6e6e73;
  --faint: #86868b;
  --line: #d2d2d7;
  --line-2: #b8b8bd;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--text);
  text-decoration: none;
  border-bottom: 1px solid var(--line-2);
}

.shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 64px;
  max-width: 1320px;
  margin: 0 auto;
  padding: 56px 32px 40px;
}

.toc {
  position: sticky;
  top: 40px;
  align-self: start;
  height: calc(100vh - 80px);
  overflow: auto;
}

.toc-head,
.navgroup h3,
.eyebrow,
th {
  text-transform: uppercase;
  color: var(--faint);
  font-weight: 500;
}

.toc a {
  display: block;
  color: var(--muted);
  font-size: 14px;
  padding: 5px 0;
  border: none;
}

.toc a:hover,
.toc a.active {
  color: var(--text);
}

main {
  max-width: 1000px;
  min-width: 0;
}

.hero {
  padding-bottom: 36px;
  margin-bottom: 36px;
  border-bottom: 1px solid var(--line);
}

h1 {
  font-size: 38px;
  line-height: 1.15;
  font-weight: 500;
  margin: 0 0 18px;
  max-width: 820px;
  letter-spacing: -2px;
}

.dek {
  font-size: 18px;
  line-height: 1.5;
  color: var(--muted);
  max-width: 720px;
  margin: 0 0 30px;
}

.meta,
.kpis,
.cards {
  display: grid;
  gap: 0;
}

.meta {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kpis {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0 0 40px;
  padding-bottom: 32px;
  border-bottom: 1px solid var(--line);
}

.cards {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 16px 0;
}

details {
  border-bottom: 1px solid var(--line);
  overflow: hidden;
}

summary {
  cursor: pointer;
  list-style: none;
  padding: 22px;
  display: flex;
  gap: 16px;
  align-items: center;
}

summary::-webkit-details-marker { display: none; }
summary::after {
  content: "+";
  margin-left: auto;
  color: var(--faint);
}
details[open] summary::after { content: "-"; }

.q {
  font-size: 12px;
  color: var(--faint);
  font-weight: 500;
  min-width: 34px;
}

summary h2 {
  font-size: 19px;
  line-height: 1.3;
  font-weight: 500;
  margin: 0;
  color: var(--text-2);
}

.content {
  padding: 0 0 30px;
}

.verdict {
  padding: 2px 0 2px 18px;
  margin: 20px 0;
  border-left: 2px solid var(--line-2);
  font-size: 15.5px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 18px 0 22px;
  font-size: 14px;
}

th {
  text-align: left;
  font-size: 11px;
  border-bottom: 1px solid var(--line-2);
  padding: 10px 14px 10px 0;
}

td {
  border-bottom: 1px solid var(--line);
  padding: 12px 14px 12px 0;
  vertical-align: top;
}

.final {
  border-top: 1px solid var(--line-2);
  padding: 36px 0 0;
  margin: 36px 0 60px;
}

@media (max-width: 860px) {
  .shell {
    display: block;
    padding: 0 24px 24px;
  }

  h1 {
    font-size: 27px;
  }

  .meta,
  .kpis,
  .cards {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  summary {
    padding: 18px 0;
  }

  table,
  thead,
  tbody,
  tr,
  th,
  td {
    display: block;
  }

  thead {
    display: none;
  }

  td {
    border: 0;
    padding: 5px 0;
  }

  td:before {
    content: attr(data-label);
    display: block;
    color: var(--faint);
    font-size: 10.5px;
    text-transform: uppercase;
  }
}
```

## 29. Starter HTML

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>Report Title</title>
</head>
<body>
  <button class="theme-toggle theme-toggle-desktop" id="themeToggleDesktop">Light</button>

  <div class="topbar">
    <div class="mark"><b>Report</b> - Category</div>
    <div class="topbar-actions">
      <button class="theme-toggle" id="themeToggleMobile">Light</button>
      <button class="navtoggle" id="navToggle" aria-expanded="false" aria-controls="toc">Contents</button>
    </div>
  </div>

  <div class="backdrop" id="backdrop"></div>

  <div class="shell">
    <nav class="toc" id="toc">
      <div class="toc-head">Contents</div>
      <div class="navgroup">
        <a href="#exec">Executive summary</a>
      </div>
      <div class="navgroup">
        <h3>Market</h3>
        <a href="#q1">1. Problem</a>
        <a href="#q2">2. Alternatives</a>
      </div>
      <div class="navgroup">
        <h3>Decision</h3>
        <a href="#q3">3. Risks</a>
        <a href="#final">Final recommendation</a>
      </div>
    </nav>

    <main>
      <section class="hero" id="exec">
        <div class="eyebrow">Report type - Market - Date</div>
        <h1>Specific report title that states the subject clearly</h1>
        <p class="dek">Short executive summary that tells the reader the conclusion upfront.</p>
        <div class="meta">
          <div><span>Verdict</span><strong>Build only with a narrow wedge</strong></div>
          <div><span>Audience</span><strong>Founders and operators</strong></div>
          <div><span>Confidence</span><strong>Medium-high</strong></div>
          <div><span>Evidence</span><strong>Interviews, market data, public sources</strong></div>
        </div>
      </section>

      <div class="kpis">
        <div class="kpi">
          <div class="num">12</div>
          <div class="label">Buyer interviews reviewed</div>
        </div>
        <div class="kpi">
          <div class="num">3</div>
          <div class="label">Viable wedges found</div>
        </div>
        <div class="kpi">
          <div class="num">High</div>
          <div class="label">Distribution risk</div>
        </div>
      </div>

      <details id="q1" open>
        <summary>
          <span class="q">Q1</span>
          <h2>What is the real customer pain?</h2>
        </summary>
        <div class="content">
          <div class="verdict warn">
            <b>Verdict: the pain is real, but budget ownership is unclear.</b>
            Validate who pays before building.
          </div>
          <p>Write the evidence and reasoning here.</p>
        </div>
      </details>

      <section class="final" id="final">
        <div class="eyebrow">Final recommendation</div>
        <h2>Build the narrow workflow, not the broad platform.</h2>
        <p>Summarize the exact next step and decision condition.</p>
      </section>
    </main>
  </div>
</body>
</html>
```

## 30. Quality Checklist

Before reusing this design, check:

- The H1 is specific, not promotional.
- The dek states a conclusion.
- The TOC groups match the reader's decision path.
- Every major section has a verdict.
- Tables have useful column names.
- Mobile table cells include `data-label`.
- The first section is open only if it helps orientation.
- The page uses hairlines, not heavy boxes.
- No decorative gradients or card shadows were added.
- The final recommendation is easy to find.
- Dark and light themes both have readable contrast.
- Mobile navigation opens, closes, and does not cover content unexpectedly.

## 31. Best Use Summary

This design works because it treats a web page like a serious memo:

- one strong conclusion
- structured navigation
- collapsible depth
- plain evidence
- restrained visual language
- responsive reading ergonomics

For future pages, keep the same discipline: fewer decorations, clearer structure, stronger verdicts.
