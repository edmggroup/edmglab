/**
 * EDMGLAB — correction receiver
 * Google Apps Script Web App. Architecture v0.2 §J, Roadmap Phase 14.
 *
 * Paste this whole file into a new Apps Script project bound to a Google
 * Sheet, deploy it as a Web App, and put the /exec URL into
 * data/feedback.json. The guide next to this file has the steps.
 *
 * WHAT IT IS FOR
 * A group member who does not have a GitHub account, or does not want one,
 * still needs a way to say "this page is wrong". This receives what they
 * write and appends it to a Sheet the group reads.
 *
 * ── READ THIS BEFORE DEPLOYING ──────────────────────────────────────
 * The /exec URL has to be public for the browser to reach it, and it will sit
 * in data/feedback.json in a repository anyone can read. So:
 *
 *   · ANYONE WHO FINDS THE URL CAN WRITE A ROW. There is no authentication
 *     and there cannot be one from a static page — a shared key in the
 *     JavaScript is readable by anyone who can read the JavaScript.
 *   · Deploy it running as YOU, with access "Anyone". Running as the user
 *     would demand a Google sign-in the browser cannot complete from a
 *     cross-origin fetch.
 *   · The Sheet is therefore a public inbox, not a private one. Do not point
 *     it at a spreadsheet containing anything else, and never put unpublished
 *     results or personal data in the same file.
 *
 * That is an acceptable trade for a correction inbox: the worst case is junk
 * rows in a sheet, which take a moment to delete. It would not be acceptable
 * for anything else, so do not reuse this pattern for anything else.
 * ────────────────────────────────────────────────────────────────────
 */

/** The tab it writes to. Created automatically if it does not exist. */
var SHEET_NAME = 'Corrections';

/** Reject anything longer than this. A correction is prose, not a payload. */
var MAX_FIELD = 4000;
var MAX_TOTAL = 12000;

/**
 * Email address to notify, or '' for none.
 * Notification failure never fails the submission — a correction that reached
 * the Sheet has arrived, whether or not the mail went out.
 */
var NOTIFY = '';

var COLUMNS = [
  'Received', 'Reported at', 'Category', 'Page', 'Record id',
  'What is wrong', 'What it should say', 'Source', 'Reported by',
  'Status', 'Notes'
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return fail('empty request');
    if (e.postData.contents.length > MAX_TOTAL) return fail('too long');

    var d;
    try {
      d = JSON.parse(e.postData.contents);
    } catch (err) {
      return fail('body was not JSON');
    }

    var problem = str(d.problem);
    if (!problem) return fail('nothing to record: "problem" was empty');

    // A submission with no page and no record is almost certainly a bot
    // finding the URL rather than a person using the form.
    if (!str(d.page) && !str(d.recordId)) return fail('no page or record given');

    var sheet = getSheet();
    sheet.appendRow([
      new Date(),
      str(d.at),
      str(d.category),
      str(d.page),
      str(d.recordId),
      problem,
      str(d.suggested),
      str(d.source),
      str(d.who),
      'new',
      ''
    ]);

    if (NOTIFY) {
      try {
        MailApp.sendEmail(
          NOTIFY,
          'EDMGLAB correction: ' + (str(d.title) || str(d.page) || 'content'),
          [
            'Page:    ' + str(d.page),
            'Record:  ' + str(d.recordId),
            'Kind:    ' + str(d.category),
            'By:      ' + (str(d.who) || '(anonymous)'),
            '',
            problem,
            '',
            str(d.suggested) ? 'Suggested: ' + str(d.suggested) : '',
            str(d.source) ? 'Source: ' + str(d.source) : '',
            '',
            sheet.getParent().getUrl()
          ].join('\n')
        );
      } catch (err) {
        // Logged, not returned. The row is already saved.
        console.warn('notification failed: ' + err);
      }
    }

    return ok({ row: sheet.getLastRow() });
  } catch (err) {
    return fail(String(err));
  }
}

/**
 * A browser visiting the /exec URL gets a plain confirmation, which is how you
 * check the deployment is live without having to submit a correction.
 */
function doGet() {
  var sheet = getSheet();
  return ok({
    service: 'EDMGLAB correction receiver',
    rows: Math.max(0, sheet.getLastRow() - 1),
    note: 'Deployment is live. POST a correction as JSON to this same URL.'
  });
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(6, 420);   // What is wrong
    sheet.setColumnWidth(7, 320);   // What it should say
  }
  return sheet;
}

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, MAX_FIELD);
}

/* Apps Script cannot set CORS response headers, but it does not need to: the
   page sends a "simple" request (text/plain), which needs no preflight, and
   the response is readable because Apps Script serves /exec with a permissive
   origin by default. Do NOT change the client to application/json — that
   triggers a preflight this script cannot answer, and the request fails in
   the browser while still working from curl. */
function ok(obj) {
  obj.ok = true;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this once from the editor to check the script works before deploying.
 * It writes one row and tells you where it went.
 */
function selfTest() {
  var res = doPost({
    postData: {
      contents: JSON.stringify({
        at: new Date().toISOString(),
        category: 'wrong',
        page: '#/formula/specific_capacitance',
        recordId: 'formula.specific_capacitance',
        problem: 'Self-test row written from the Apps Script editor.',
        suggested: '',
        source: '',
        who: 'selfTest()'
      })
    }
  });
  console.log(res.getContent());
  console.log('Sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
}
