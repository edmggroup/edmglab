/**
 * EDMGLAB — export the draft content for review
 *
 * Produces one Word document per module, plus a cover sheet, so the group can
 * read 60,000 words away from a screen and mark them up the way scientists
 * actually mark things up.
 *
 * WHY WORD AND NOT A WEB PAGE. The review page at #/review records verdicts,
 * and that is a different activity from reading. Reading a long argument for
 * errors is done in a chair, often on paper, often by somebody who will write
 * in a margin — and the person best placed to check the safety section may not
 * be the person who opens the app at all. So: a document to read and annotate,
 * a page to record the verdict.
 *
 * EVERY UNIT CARRIES ITS ID. That is the join between the two halves. A
 * reviewer writes against `material.lifepo4`, and that string is what the
 * review page, the endpoint and the JSON file all call the same thing.
 *
 * The set of units comes from js/lib/review-units.js, which the review page
 * also imports — so the document and the app can never disagree about what
 * there is to review.
 *
 * Run:  node tools/export-review.mjs [outputDir]
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';

/* `docx` resolves for require() but not for a bare ESM import here — it is
   installed globally rather than beside this file, and Node's ESM resolver
   does not search the global root. createRequire uses the CommonJS resolver,
   which does. This is a smaller change than adding a package.json to a
   project whose whole premise is that it has no build step. */
const require_ = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, PageBreak
} = require_('docx');
import { unitsIn, moduleName, PRIORITY } from '../js/lib/review-units.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = process.argv[2] || join(ROOT, 'review-export');

/* The registry is parsed out of data.js rather than duplicated, for the same
   reason as everything else in this project: a second list is a list that
   rots. If this regex ever stops matching, data.js changed shape and this
   should fail loudly rather than silently export a subset. */
function registry() {
  const src = readFileSync(join(ROOT, 'js/data.js'), 'utf8');
  const block = src.match(/const REGISTRY = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('Could not find REGISTRY in js/data.js — has it been restructured?');
  const rows = [...block[1].matchAll(/^\s*'?([a-zA-Z/_-]+)'?:\s*'([^']+)'/gm)].map(([, k, f]) => [k, f]);
  if (!rows.length) throw new Error('REGISTRY matched but parsed to nothing.');
  return rows;
}

const INK = '1B2733';
const MUTED = '5C6672';
const RULE = 'C9D2DC';

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, ...opts.run })],
  spacing: { after: opts.after ?? 120 },
  ...opts.para
});

const heading = (text, level) => new Paragraph({
  text, heading: level, spacing: { before: 260, after: 130 }
});

/** The verdict box. Deliberately a table with visible borders and real room to
 *  write: a line saying "notes:" gets ignored, a box gets filled in. */
function verdictBox() {
  const cell = (children, width, shaded) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shaded ? { type: ShadingType.CLEAR, fill: 'F2F5F8' } : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children
  });
  return new Table({
    columnWidths: [1500, 7500],
    width: { size: 9000, type: WidthType.DXA },
    rows: [
      new TableRow({ children: [
        cell([p('Verdict', { run: { bold: true, size: 17, color: INK }, after: 0 })], 1500, true),
        cell([p('☐  Correct as written        ☐  Needs a change        ☐  I cannot judge this',
          { run: { size: 17, color: INK }, after: 0 })], 7500, true)
      ] }),
      new TableRow({ children: [
        cell([p('What is wrong', { run: { bold: true, size: 17, color: INK }, after: 0 })], 1500, false),
        cell([p('', { after: 0 }), p('', { after: 0 })], 7500, false)
      ] }),
      new TableRow({ children: [
        cell([p('Source', { run: { bold: true, size: 17, color: INK }, after: 0 })], 1500, false),
        cell([p('', { after: 0 })], 7500, false)
      ] })
    ]
  });
}

function unitBlock(u) {
  const out = [
    new Paragraph({
      children: [new TextRun({ text: u.title, bold: true, size: 24, color: INK })],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 60 }
    }),
    new Paragraph({
      children: [new TextRun({ text: u.id, font: 'Consolas', size: 16, color: MUTED })],
      spacing: { after: 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 } }
    })
  ];

  for (const [label, text] of u.fields) {
    // A null text marks a sub-heading for the entries of a nested array.
    if (text === null) {
      out.push(new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 19, color: INK })],
        spacing: { before: 200, after: 60 }
      }));
      continue;
    }
    if (label.trim()) {
      out.push(new Paragraph({
        children: [new TextRun({ text: label.trim().toUpperCase(), bold: true, size: 15, color: MUTED })],
        spacing: { before: 150, after: 40 },
        indent: label.startsWith('   ') ? { left: 280 } : undefined
      }));
    }
    // Never a literal \n — one Paragraph per line, per the docx gotchas.
    for (const line of String(text).split('\n')) {
      out.push(new Paragraph({
        children: [new TextRun({ text: line, size: 20, color: INK })],
        spacing: { after: 50 },
        indent: label.startsWith('   ') ? { left: 280 } : undefined
      }));
    }
  }

  out.push(new Paragraph({ text: '', spacing: { after: 100 } }));
  out.push(verdictBox());
  return out;
}

function moduleDoc(key, units) {
  const name = moduleName(key);
  const priority = PRIORITY.find(([k]) => k === key);
  const words = units.reduce((n, u) => n + u.words, 0);

  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'EDMGLAB — draft content for review', size: 18, color: MUTED })],
      spacing: { after: 60 }
    }),
    new Paragraph({ text: name, heading: HeadingLevel.TITLE, spacing: { after: 100 } }),
    p(`${units.length} entries · about ${words.toLocaleString('en-GB')} words · exported ${new Date().toISOString().slice(0, 10)}`,
      { run: { size: 18, color: MUTED }, after: 200 })
  ];

  if (priority) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Why this one matters: ', bold: true, size: 20, color: INK }),
        new TextRun({ text: priority[1], size: 20, color: INK })],
      spacing: { after: 200 },
      shading: { type: ShadingType.CLEAR, fill: 'FFF4E0' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C98A2E', space: 10 } }
    }));
  }

  children.push(new Paragraph({
    children: [new TextRun({
      text: 'How to use this. Read each entry and tick one box. "I cannot judge this" is a real and useful '
          + 'answer — it tells us the entry needs a different reviewer, which is information we do not '
          + 'otherwise have. Where something is wrong, say what it should say and where that comes from; '
          + '"this is wrong" without a source cannot be acted on. Quote the id (the grey line under each '
          + 'heading) in any note — that string is what the app and the data file both call this entry.',
      size: 19, color: INK
    })],
    spacing: { after: 300 }
  }));

  for (const u of units) children.push(...unitBlock(u));

  return new Document({
    creator: 'EDMGLAB',
    title: `${name} — draft for review`,
    description: 'Draft content pending review by the Energy Devices and Materials Group.',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 20, color: INK } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal',
          run: { size: 40, bold: true, color: INK } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { size: 24, bold: true, color: INK } }
      ]
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children
    }]
  });
}

function coverDoc(all) {
  const total = all.reduce((n, m) => n + m.units.length, 0);
  const words = all.reduce((n, m) => n + m.units.reduce((w, u) => w + u.words, 0), 0);

  const rows = [new TableRow({ children: ['Module', 'Entries', 'Words', 'Priority'].map((h, i) =>
    new TableCell({
      width: { size: [4200, 1200, 1400, 2200][i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: 'EEF1F5' },
      margins: { top: 80, bottom: 80, left: 110, right: 110 },
      children: [p(h, { run: { bold: true, size: 18, color: INK }, after: 0 })]
    })) })];

  for (const m of all) {
    const pr = PRIORITY.findIndex(([k]) => k === m.key);
    rows.push(new TableRow({ children: [
      moduleName(m.key),
      String(m.units.length),
      m.units.reduce((w, u) => w + u.words, 0).toLocaleString('en-GB'),
      pr >= 0 ? (pr === 0 ? 'FIRST — safety' : `${pr + 1}`) : ''
    ].map((t, i) => new TableCell({
      width: { size: [4200, 1200, 1400, 2200][i], type: WidthType.DXA },
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      children: [p(t, { run: { size: 18, color: i === 3 && pr === 0 ? 'A8480F' : INK, bold: i === 3 && pr === 0 }, after: 0 })]
    })) }));
  }

  return new Document({
    creator: 'EDMGLAB',
    title: 'EDMGLAB draft content — review pack',
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: [
        new Paragraph({ text: 'EDMGLAB draft content', heading: HeadingLevel.TITLE, spacing: { after: 80 } }),
        p('A review pack for the Energy Devices and Materials Group', { run: { size: 22, color: MUTED }, after: 240 }),
        p(`${total} entries · about ${words.toLocaleString('en-GB')} words · exported ${new Date().toISOString().slice(0, 10)}`,
          { run: { size: 19, color: MUTED }, after: 300 }),

        heading('What this is', HeadingLevel.HEADING_1),
        p('Every word of scientific content in EDMGLAB, written to be checked. None of it has been reviewed '
          + 'by anyone in the group yet, and the platform says so on every page. This pack is how that stops '
          + 'being true.', { after: 160 }),
        p('The automated checks in tools/ validate structure, not truth. They confirm every cross-reference '
          + 'resolves, every value carries a provenance, every formula states where it is valid, and every '
          + 'troubleshooting entry offers more than one cause. None of them can tell you a definition is '
          + 'wrong. Only you can.', { after: 240 }),

        heading('Start here', HeadingLevel.HEADING_1),
        new Paragraph({
          children: [
            new TextRun({ text: 'The safety section first, with your safety officer. ', bold: true, size: 20, color: INK }),
            new TextRun({ text: 'It is the only part of this platform where being wrong could hurt somebody, '
              + 'and it should not be treated as guidance by anyone until a qualified person has read it.', size: 20, color: INK })
          ],
          spacing: { after: 240 },
          shading: { type: ShadingType.CLEAR, fill: 'FDECEA' },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'B3402F', space: 10 } }
        }),
        p('After that, the order in the Priority column below: the newest and most claim-heavy modules first, '
          + 'the glossary and the quiz last. A wrong glossary entry is a nuisance; a wrong validity condition '
          + 'on a formula is a result somebody publishes.', { after: 240 }),

        heading('How to send it back', HeadingLevel.HEADING_1),
        p('Either mark up these documents and return them, or record verdicts directly in the app at #/review, '
          + 'which shows the same entries and keeps a running count of what is still unreviewed. The two use the '
          + 'same ids, so they can be mixed freely — read on paper, record in the app.', { after: 160 }),
        p('Quote the id in every note. It is the grey line under each heading, and it is what the app and the '
          + 'JSON file both call that entry.', { after: 300 }),

        heading('What is in the pack', HeadingLevel.HEADING_1),
        new Table({ columnWidths: [4200, 1200, 1400, 2200], width: { size: 9000, type: WidthType.DXA }, rows }),

        new Paragraph({ children: [new PageBreak()] }),
        heading('One thing to look for above all', HeadingLevel.HEADING_1),
        p('This platform makes a great many claims of the form "this measurement does not tell you X". Those '
          + 'are the load-bearing sentences — they are what separates it from a textbook summary, and they are '
          + 'the ones most likely to be subtly wrong. If you read nothing else closely, read those.',
          { after: 160 }),
        p('Also worth your scepticism: anything phrased as a rule without a stated exception, any number '
          + 'without a provenance next to it, and any place where the writing sounds more confident than the '
          + 'evidence behind it. Those last ones are the hardest for an automated check to find and the '
          + 'easiest for a working scientist to spot.', { after: 0 })
      ]
    }]
  });
}

/* ══════════════════════════════════════════════════════════ */

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const all = [];
for (const [key, file] of registry()) {
  let payload;
  try { payload = JSON.parse(readFileSync(join(ROOT, 'data', file), 'utf8')); }
  catch { continue; }
  const units = unitsIn(key, payload);
  if (units.length) all.push({ key, units });
}

/* Safety first, then the declared priority order, then the rest by size —
   the same order the cover sheet asks people to work in, so a reviewer who
   opens the folder alphabetically still meets them in a sensible sequence. */
const rank = (k) => {
  const i = PRIORITY.findIndex(([pk]) => pk === k);
  return i >= 0 ? i : PRIORITY.length + 1;
};
all.sort((a, b) => rank(a.key) - rank(b.key) || b.units.length - a.units.length);

let n = 0;
await writeFile(join(OUT, '00 — Start here.docx'), await Packer.toBuffer(coverDoc(all)));
for (const m of all) {
  n++;
  const safe = moduleName(m.key).replace(/[^\w —-]+/g, '').replace(/\s+/g, ' ').trim();
  const name = `${String(n).padStart(2, '0')} — ${safe}.docx`;
  await writeFile(join(OUT, name), await Packer.toBuffer(moduleDoc(m.key, m.units)));
  console.log(String(m.units.length).padStart(4), name);
}

const total = all.reduce((s, m) => s + m.units.length, 0);
const words = all.reduce((s, m) => s + m.units.reduce((w, u) => w + u.words, 0), 0);
console.log(`\n${n} module documents + cover · ${total} entries · ~${Math.round(words / 1000)}k words`);
console.log(`→ ${OUT}`);
