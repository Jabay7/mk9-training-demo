/**
 * MK9 Training — lead tracker and calendar automation
 * ---------------------------------------------------
 * Receives contact-form submissions from trainwithmk9.com and, for each one:
 *   1. appends a row to a Google Sheet (downloadable as Excel any time),
 *   2. creates a follow-up reminder on a dedicated MK9 Training calendar,
 *   3. emails an instant alert.
 * A weekly digest goes out every Monday morning with the sheet attached.
 *
 * Run setup() once. It builds the spreadsheet, the calendar, and the weekly
 * trigger, then emails you the links. See automation/README.md to deploy.
 *
 * No email address is hardcoded: alerts go to whoever authorizes the script.
 * To send them elsewhere, add a NOTIFY_EMAIL script property.
 */

/**
 * Where alerts and the weekly digest should go, if not the account running this.
 * That address also gets edit access to the sheet and calendar during setup().
 * Fill it in, then run setup().
 *
 * Blank in source control on purpose: this repository is public. Type the address
 * into the Apps Script editor, not into the repo.
 */
var NOTIFY_EMAIL_ON_SETUP = '';

var CONFIG = {
  spreadsheetTitle: 'MK9 Training — Lead Tracker',
  sheetName: 'Leads',
  calendarName: 'MK9 Training',
  followUpHours: 24,   // how long after a lead arrives to schedule the nudge
  digestHour: 8        // Monday digest send hour, 24h clock
};

var COLUMNS = [
  'Date Received', 'Name', 'Email', 'Phone', 'Program', 'First Responder',
  'Comments', 'Source', 'Status', 'Contacted', 'Follow-Up Date', 'Days Open', 'Notes'
];

var COL = {
  date: 1, name: 2, email: 3, phone: 4, program: 5, responder: 6,
  comments: 7, source: 8, status: 9, contacted: 10, followUp: 11, daysOpen: 12, notes: 13
};

var STATUSES = ['New', 'Contacted', 'Session Booked', 'Active Client', 'Not a Fit'];

var PROGRAM_LABELS = {
  day: 'Day Program',
  board: 'Board & Train',
  unsure: 'Not sure — help me decide'
};

var RESPONDER_LABELS = {
  '': '—',
  military: 'Military / Veteran',
  police: 'Law Enforcement',
  fire: 'Firefighter',
  ems: 'EMT / Paramedic',
  medical: 'Doctor / Nurse',
  other: 'Other First Responder'
};

/* ============================================================
   ONE-TIME SETUP
   ============================================================ */

function setup() {
  var props = PropertiesService.getScriptProperties();

  // Saved before anything else, because sharing below depends on it.
  if (NOTIFY_EMAIL_ON_SETUP) {
    props.setProperty('NOTIFY_EMAIL', NOTIFY_EMAIL_ON_SETUP.trim());
  }

  var ss = SpreadsheetApp.create(CONFIG.spreadsheetTitle);
  var sheet = ss.getSheets()[0].setName(CONFIG.sheetName);
  var lastRow = 1000;

  sheet.getRange(1, 1, 1, COLUMNS.length)
    .setValues([COLUMNS])
    .setFontWeight('bold')
    .setBackground('#0a3161')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  var widths = [150, 160, 220, 130, 150, 160, 320, 110, 130, 95, 130, 95, 280];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);

  sheet.getRange(2, COL.date, lastRow, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, COL.followUp, lastRow, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(2, COL.comments, lastRow, 1).setWrap(true);
  sheet.getRange(2, COL.notes, lastRow, 1).setWrap(true);

  // Status dropdown. A lone checkbox cannot distinguish "called, no answer"
  // from "booked", which is the distinction that actually drives follow-up.
  sheet.getRange(2, COL.status, lastRow, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true)
      .setAllowInvalid(false).build()
  );

  sheet.getRange(2, COL.contacted, lastRow, 1).insertCheckboxes();

  // Days Open, written across the range so manually added rows get it too.
  sheet.getRange(2, COL.daysOpen, lastRow, 1)
    .setFormula('=IF($A2="","",INT(NOW()-$A2))')
    .setHorizontalAlignment('center');

  applyConditionalFormatting_(sheet, lastRow);

  var calendar = CalendarApp.createCalendar(CONFIG.calendarName, {
    summary: 'Client sessions and lead follow-ups for MK9 Training',
    color: CalendarApp.Color.BLUE
  });

  props.setProperty('SPREADSHEET_ID', ss.getId());
  props.setProperty('CALENDAR_ID', calendar.getId());

  shareWith_(ss, calendar);
  installWeeklyTrigger_();

  var msg =
    '<p>Your MK9 Training lead tracker is ready.</p>' +
    '<p><b>Sheet:</b> <a href="' + ss.getUrl() + '">' + CONFIG.spreadsheetTitle + '</a><br>' +
    '<b>Calendar:</b> ' + CONFIG.calendarName + ' (in Google Calendar)</p>' +
    '<p>Next: deploy this script as a web app and give the URL to your website, ' +
    'so submissions start flowing in. Steps are in automation/README.md.</p>';

  // Whoever ran setup() needs the links too, not just the alert recipient.
  var to = [recipient_()];
  var owner = Session.getEffectiveUser().getEmail();
  if (owner && to.indexOf(owner) === -1) to.push(owner);

  MailApp.sendEmail({
    to: to.join(','),
    subject: 'MK9 lead tracker is set up',
    htmlBody: msg
  });

  Logger.log('Spreadsheet: ' + ss.getUrl());
  Logger.log('Calendar ID: ' + calendar.getId());
  return ss.getUrl();
}

/**
 * Grants the alert recipient edit access when the script runs in someone else's
 * account — the tracker is built by whoever deploys it, but the person working
 * the leads has to be able to open and tick things off.
 */
function shareWith_(ss, calendar) {
  var share = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  var owner = Session.getEffectiveUser().getEmail();
  if (!share || share === owner) return;

  try { DriveApp.getFileById(ss.getId()).addEditor(share); }
  catch (err) { Logger.log('sheet share failed: ' + err); }

  try { calendar.addEditor(share); }
  catch (err) { Logger.log('calendar share failed: ' + err); }
}

/**
 * Green once the Contacted box is ticked, red until then. Only rows holding an
 * actual lead are coloured, so the empty sheet below them stays white.
 */
function applyConditionalFormatting_(sheet, lastRow) {
  var body = sheet.getRange(2, 1, lastRow, COLUMNS.length);

  var done = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",$J2=TRUE)')
    .setBackground('#d9ead3').setRanges([body]).build();

  // <>TRUE rather than =FALSE, so a blank box counts as outstanding too.
  var open = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A2<>"",$J2<>TRUE)')
    .setBackground('#f4cccc').setRanges([body]).build();

  sheet.setConditionalFormatRules([done, open]);
}

/**
 * Re-applies the colour rules to the spreadsheet that already exists.
 *
 * Run this after editing applyConditionalFormatting_ — never setup(), which would
 * build a second spreadsheet and calendar and start writing to the empty ones.
 */
function refreshFormatting() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Nothing to refresh — run setup() first.');

  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error('Sheet "' + CONFIG.sheetName + '" not found.');

  applyConditionalFormatting_(sheet, 1000);
  Logger.log('Colour rules refreshed: ' + ss.getUrl());
  return ss.getUrl();
}

function installWeeklyTrigger_() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'sendWeeklyDigest') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('sendWeeklyDigest')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(CONFIG.digestHour).create();
}

/* ============================================================
   FORM ENDPOINT
   ============================================================ */

function doGet() {
  // Health check, so the website deployment can be verified without sending a lead.
  var props = PropertiesService.getScriptProperties();
  return json_({
    status: 'ok',
    configured: Boolean(props.getProperty('SPREADSHEET_ID')),
    calendar: Boolean(props.getProperty('CALENDAR_ID'))
  });
}

function doPost(e) {
  var lead = parseLead_(e);

  // Each step is isolated: a failure in one must not cost the lead. The email
  // matters most, so it is attempted even if the sheet write throws.
  var sheetOk = false, calendarOk = false, mailOk = false, problems = [];

  try { appendLead_(lead); sheetOk = true; }
  catch (err) { problems.push('sheet: ' + err); }

  try { createFollowUp_(lead); calendarOk = true; }
  catch (err) { problems.push('calendar: ' + err); }

  try { notify_(lead, problems); mailOk = true; }
  catch (err) { problems.push('email: ' + err); }

  if (problems.length) Logger.log(problems.join(' | '));

  // Report success if the lead reached a human by any route. The site falls back
  // to its backup endpoint only when this reports failure, so claiming success
  // when nothing landed anywhere would lose the enquiry silently.
  return json_({
    success: String(sheetOk || mailOk),
    message: sheetOk && mailOk ? 'Logged and sent.' : problems.join(' | ') || 'Partial.',
    logged: sheetOk,
    scheduled: calendarOk
  });
}

function parseLead_(e) {
  var p = (e && e.parameter) || {};

  if (e && e.postData && e.postData.contents && !p.name) {
    try {
      var body = JSON.parse(e.postData.contents);
      for (var k in body) if (!p[k]) p[k] = body[k];
    } catch (ignored) {}
  }

  return {
    received: new Date(),
    name: String(p.name || '').trim() || '(no name given)',
    email: String(p.email || '').trim(),
    phone: formatPhone_(p.phone),
    program: PROGRAM_LABELS[p.program] || String(p.program || '').trim() || '—',
    responder: RESPONDER_LABELS[p.service !== undefined ? p.service : ''] ||
               String(p.service || '').trim() || '—',
    comments: String(p.dog || p.comments || '').trim(),
    source: String(p.source || 'Website').trim()
  };
}

/**
 * Renders a ten-digit US number as (760) 271-5998.
 *
 * The website formats the field as it is typed, so this is a backstop for
 * anything that arrives unformatted. Anything that is not ten digits is passed
 * through untouched rather than mangled — an international or partial number is
 * still more useful to read than a wrongly reformatted one.
 */
function formatPhone_(raw) {
  var s = String(raw || '').trim();
  var d = s.replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length !== 10) return s;
  return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
}

function appendLead_(lead) {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Not set up yet — run setup() first.');

  var sheet = SpreadsheetApp.openById(id).getSheetByName(CONFIG.sheetName);
  var row = nextRow_(sheet);

  var followUp = new Date(lead.received.getTime() + CONFIG.followUpHours * 3600 * 1000);

  sheet.getRange(row, COL.date, 1, COL.notes).setValues([[
    lead.received, lead.name, lead.email, lead.phone, lead.program,
    lead.responder, lead.comments, lead.source, 'New', false, followUp, '', ''
  ]]);

  // Re-assert per-row bits in case the row fell outside the ranges setup() styled.
  sheet.getRange(row, COL.contacted).insertCheckboxes();
  sheet.getRange(row, COL.daysOpen).setFormula('=IF($A' + row + '="","",INT(NOW()-$A' + row + '))');
  sheet.getRange(row, COL.date).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(row, COL.followUp).setNumberFormat('yyyy-mm-dd');
}

/**
 * First row with no Date Received.
 *
 * Deliberately not getLastRow(). setup() pre-fills the tick box and Days Open
 * columns all the way down, and Sheets counts those as content, so getLastRow()
 * reports about 1001 on a tracker with no leads in it at all. Appending after
 * that put every lead a thousand rows below the headers, where the sheet looks
 * empty unless you press Ctrl+End.
 */
function nextRow_(sheet) {
  var max = sheet.getMaxRows();
  var dates = sheet.getRange(2, COL.date, Math.max(max - 1, 1), 1).getValues();
  for (var i = 0; i < dates.length; i++) {
    if (dates[i][0] === '' || dates[i][0] === null) return i + 2;
  }
  return max + 1;
}

/**
 * Moves stray leads back up under the headers.
 *
 * Anything appended before the fix above landed around row 1002. This collects
 * every row that has a Date Received, rewrites them in order from row 2, and
 * puts back the tick boxes and formulas that clearing wipes out. Run it once.
 */
function repairRows() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Nothing to repair — run setup() first.');

  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error('Sheet "' + CONFIG.sheetName + '" not found.');

  var span = Math.max(sheet.getMaxRows() - 1, 1);
  var all = sheet.getRange(2, 1, span, COLUMNS.length).getValues();

  var leads = [];
  for (var i = 0; i < all.length; i++) {
    var d = all[i][COL.date - 1];
    if (d !== '' && d !== null) leads.push(all[i]);
  }

  sheet.getRange(2, 1, span, COLUMNS.length).clearContent();
  if (leads.length) sheet.getRange(2, 1, leads.length, COLUMNS.length).setValues(leads);

  // clearContent also removed the pre-filled helpers, so restore them.
  sheet.getRange(2, COL.contacted, span, 1).insertCheckboxes();
  sheet.getRange(2, COL.daysOpen, span, 1).setFormula('=IF($A2="","",INT(NOW()-$A2))');
  sheet.getRange(2, COL.date, span, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, COL.followUp, span, 1).setNumberFormat('yyyy-mm-dd');

  Logger.log('Recovered ' + leads.length + ' lead row(s): ' + ss.getUrl());
  return leads.length;
}

/**
 * Pulls leads out of the other tracker copies into the live sheet.
 *
 * Each setup() run created a fresh spreadsheet, so leads landed in whichever
 * copy was current at the time. This appends anything the live sheet does not
 * already hold, keyed on time, name and email so running it twice is harmless.
 * Once it reports what it moved, the other copies are safe to delete.
 */
function importStrandedLeads() {
  var liveId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!liveId) throw new Error('Run setup() first.');

  var live = SpreadsheetApp.openById(liveId).getSheetByName(CONFIG.sheetName);
  var seen = {}, held = 0;

  var existing = live.getRange(2, 1, Math.max(live.getMaxRows() - 1, 1), COLUMNS.length).getValues();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i][COL.date - 1]) { seen[leadKey_(existing[i])] = true; held++; }
  }

  var incoming = [], scanned = 0;
  var files = DriveApp.getFilesByName(CONFIG.spreadsheetTitle);

  while (files.hasNext()) {
    var f = files.next();
    if (f.getId() === liveId || f.isTrashed()) continue;

    var sh = SpreadsheetApp.openById(f.getId()).getSheetByName(CONFIG.sheetName);
    if (!sh) continue;
    scanned++;

    var rows = sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), COLUMNS.length).getValues();
    for (var j = 0; j < rows.length; j++) {
      if (!rows[j][COL.date - 1]) continue;
      var k = leadKey_(rows[j]);
      if (seen[k]) continue;
      seen[k] = true;
      incoming.push(rows[j]);
    }
  }

  if (incoming.length) {
    incoming.sort(function (a, b) { return a[COL.date - 1] - b[COL.date - 1]; });

    var start = nextRow_(live);
    live.getRange(start, 1, incoming.length, COLUMNS.length).setValues(incoming);
    live.getRange(start, COL.contacted, incoming.length, 1).insertCheckboxes();
    live.getRange(start, COL.daysOpen, incoming.length, 1)
      .setFormula('=IF($A' + start + '="","",INT(NOW()-$A' + start + '))');
    live.getRange(start, COL.date, incoming.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    live.getRange(start, COL.followUp, incoming.length, 1).setNumberFormat('yyyy-mm-dd');
  }

  Logger.log('Scanned ' + scanned + ' other copies. Imported ' + incoming.length +
             ' lead(s). Live sheet now holds ' + (held + incoming.length) + '.');
  return incoming.length;
}

/**
 * Removes every lead row, leaving the headers, tick boxes and formulas in place.
 * For wiping test submissions before the tracker goes into real use.
 */
function clearLeads() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run setup() first.');

  var sheet = SpreadsheetApp.openById(id).getSheetByName(CONFIG.sheetName);
  var span = Math.max(sheet.getMaxRows() - 1, 1);

  var rows = sheet.getRange(2, 1, span, COLUMNS.length).getValues();
  var removed = 0;
  for (var i = 0; i < rows.length; i++) if (rows[i][COL.date - 1]) removed++;

  sheet.getRange(2, 1, span, COLUMNS.length).clearContent();
  sheet.getRange(2, COL.contacted, span, 1).insertCheckboxes();
  sheet.getRange(2, COL.daysOpen, span, 1).setFormula('=IF($A2="","",INT(NOW()-$A2))');
  sheet.getRange(2, COL.date, span, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, COL.followUp, span, 1).setNumberFormat('yyyy-mm-dd');

  Logger.log('Cleared ' + removed + ' lead row(s).');
  return removed;
}

/**
 * Removes the follow-up reminders this script created, leaving anything booked
 * on the calendar by hand untouched. For clearing test data before going live.
 */
function clearFollowUps() {
  // Every setup() run created its own calendar, all called "MK9 Training", and
  // reminders went to whichever was current at the time. Sweeping only the one
  // in properties leaves the rest behind, so gather every calendar by that name
  // as well as the recorded one.
  var cals = CalendarApp.getCalendarsByName(CONFIG.calendarName) || [];
  var id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  if (id) {
    var current = CalendarApp.getCalendarById(id);
    if (current && !cals.some(function (c) { return c.getId() === current.getId(); })) {
      cals.push(current);
    }
  }
  if (!cals.length) throw new Error('No "' + CONFIG.calendarName + '" calendar found.');

  // Wide window: reminders sit a day out, but tests may have drifted either way.
  var from = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  var to = new Date(Date.now() + 365 * 24 * 3600 * 1000);

  var removed = 0, kept = 0;
  for (var c = 0; c < cals.length; c++) {
    var events = cals[c].getEvents(from, to);
    for (var i = 0; i < events.length; i++) {
      if (events[i].getTitle().indexOf('Follow up: ') === 0) {
        events[i].deleteEvent();
        removed++;
      } else {
        kept++;
      }
    }
  }

  Logger.log('Swept ' + cals.length + ' calendar(s) named "' + CONFIG.calendarName +
             '". Deleted ' + removed + ' follow-up reminder(s), left ' + kept + ' other event(s) alone.');
  return removed;
}

/**
 * Deletes the duplicate calendars left behind by repeated setup() runs.
 *
 * Every setup() created a calendar with the same name, so the calendar list ends
 * up with several identical entries and only one of them receives reminders.
 * Keeps the calendar recorded in CALENDAR_ID and removes the rest, skipping any
 * that holds an event this script did not create so a hand-booked session can
 * never be destroyed by a name collision.
 */
function removeDuplicateCalendars() {
  var keepId = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  if (!keepId) throw new Error('Run setup() first.');

  var cals = CalendarApp.getCalendarsByName(CONFIG.calendarName) || [];
  var from = new Date(Date.now() - 365 * 24 * 3600 * 1000);
  var to = new Date(Date.now() + 365 * 24 * 3600 * 1000);

  var deleted = 0, kept = 0, skipped = [];

  for (var i = 0; i < cals.length; i++) {
    var c = cals[i];
    if (c.getId() === keepId) { kept++; continue; }

    var foreign = 0;
    var events = c.getEvents(from, to);
    for (var j = 0; j < events.length; j++) {
      if (events[j].getTitle().indexOf('Follow up: ') !== 0) foreign++;
    }
    if (foreign) { skipped.push(c.getId() + ' holds ' + foreign + ' event(s) we did not create'); continue; }

    c.deleteCalendar();
    deleted++;
  }

  Logger.log('Kept ' + kept + ' calendar (' + keepId + '). Deleted ' + deleted + ' duplicate(s).' +
             (skipped.length ? ' Skipped: ' + skipped.join('; ') : ' Nothing skipped.'));
  return deleted;
}

/** Identity of a lead, so the same one is never imported twice. */
function leadKey_(row) {
  var d = row[COL.date - 1];
  return (d instanceof Date ? d.getTime() : String(d)) + '|' +
         String(row[COL.name - 1]).trim() + '|' + String(row[COL.email - 1]).trim();
}

function createFollowUp_(lead) {
  var id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  if (!id) return;

  var calendar = CalendarApp.getCalendarById(id);
  if (!calendar) return;

  var start = new Date(lead.received.getTime() + CONFIG.followUpHours * 3600 * 1000);
  var end = new Date(start.getTime() + 15 * 60 * 1000);

  calendar.createEvent('Follow up: ' + lead.name, start, end, {
    description:
      'Lead from trainwithmk9.com\n\n' +
      'Name: ' + lead.name + '\n' +
      'Email: ' + lead.email + '\n' +
      'Phone: ' + (lead.phone || '—') + '\n' +
      'Program: ' + lead.program + '\n' +
      'First responder: ' + lead.responder + '\n\n' +
      'About the dog:\n' + (lead.comments || '—')
  }).addPopupReminder(10);
}

/* ============================================================
   EMAIL
   ============================================================ */

function notify_(lead, problems) {
  var rows = [
    ['Name', lead.name],
    ['Email', lead.email ? '<a href="mailto:' + lead.email + '">' + lead.email + '</a>' : '—'],
    ['Phone', lead.phone ? '<a href="tel:' + lead.phone.replace(/[^0-9+]/g, '') + '">' + lead.phone + '</a>' : '—'],
    ['Program', lead.program],
    ['First responder', lead.responder],
    ['Received', Utilities.formatDate(lead.received, Session.getScriptTimeZone(), 'EEE d MMM yyyy, h:mm a')]
  ];

  var table = rows.map(function (r) {
    return '<tr><td style="padding:6px 14px 6px 0;color:#667;white-space:nowrap">' + r[0] +
           '</td><td style="padding:6px 0"><b>' + r[1] + '</b></td></tr>';
  }).join('');

  var warning = problems && problems.length
    ? '<p style="background:#fdecea;padding:10px;border-radius:6px">Heads up: part of the ' +
      'automation failed, so this lead may not be in the sheet. Details: ' +
      escapeHtml_(problems.join(' | ')) + '</p>'
    : '';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px">' +
    '<h2 style="color:#0a3161;margin:0 0 4px">New lead from trainwithmk9.com</h2>' +
    '<p style="color:#667;margin:0 0 16px">Follow up within ' + CONFIG.followUpHours +
    ' hours — a reminder is already on your MK9 Training calendar.</p>' +
    warning +
    '<table style="border-collapse:collapse;font-size:15px">' + table + '</table>' +
    '<h3 style="color:#0a3161;margin:20px 0 6px">About the dog</h3>' +
    '<p style="white-space:pre-wrap;margin:0">' + escapeHtml_(lead.comments || '—') + '</p>' +
    sheetLinkHtml_() +
    '</div>';

  MailApp.sendEmail({
    to: recipient_(),
    subject: 'New lead: ' + lead.name + (lead.phone ? ' — ' + lead.phone : ''),
    replyTo: lead.email || undefined,
    htmlBody: html
  });
}

function sendWeeklyDigest() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) return;

  var ss = SpreadsheetApp.openById(id);
  var sheet = ss.getSheetByName(CONFIG.sheetName);
  var last = sheet.getLastRow();
  if (last < 2) { sendDigestEmail_(ss, 'No leads yet this week.', null); return; }

  var values = sheet.getRange(2, 1, last - 1, COLUMNS.length).getValues();
  var weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  var thisWeek = 0, uncontacted = [], booked = 0;

  values.forEach(function (r) {
    var received = r[COL.date - 1];
    if (!received) return;
    if (received >= weekAgo) thisWeek++;
    if (r[COL.status - 1] === 'Session Booked' || r[COL.status - 1] === 'Active Client') booked++;
    if (r[COL.contacted - 1] !== true) {
      uncontacted.push({
        name: r[COL.name - 1],
        phone: r[COL.phone - 1],
        email: r[COL.email - 1],
        days: Math.floor((Date.now() - received.getTime()) / 86400000)
      });
    }
  });

  uncontacted.sort(function (a, b) { return b.days - a.days; });

  var summary =
    '<table style="border-collapse:collapse;font-size:15px">' +
    '<tr><td style="padding:4px 14px 4px 0;color:#667">New leads this week</td><td><b>' + thisWeek + '</b></td></tr>' +
    '<tr><td style="padding:4px 14px 4px 0;color:#667">Total leads on file</td><td><b>' + values.length + '</b></td></tr>' +
    '<tr><td style="padding:4px 14px 4px 0;color:#667">Booked or active clients</td><td><b>' + booked + '</b></td></tr>' +
    '<tr><td style="padding:4px 14px 4px 0;color:#667">Still uncontacted</td><td><b>' + uncontacted.length + '</b></td></tr>' +
    '</table>';

  if (uncontacted.length) {
    summary += '<h3 style="color:#c8102e;margin:20px 0 6px">Waiting on you</h3><ul style="margin:0;padding-left:18px">';
    uncontacted.slice(0, 15).forEach(function (u) {
      summary += '<li style="margin-bottom:4px">' + escapeHtml_(u.name) +
        (u.phone ? ' — ' + escapeHtml_(u.phone) : '') +
        ' <span style="color:#888">(' + u.days + ' day' + (u.days === 1 ? '' : 's') + ' old)</span></li>';
    });
    summary += '</ul>';
  }

  sendDigestEmail_(ss, summary, exportXlsx_(ss.getId(), CONFIG.spreadsheetTitle));
}

function sendDigestEmail_(ss, bodyHtml, attachment) {
  var options = {
    to: recipient_(),
    subject: 'MK9 weekly lead summary',
    htmlBody:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px">' +
      '<h2 style="color:#0a3161;margin:0 0 16px">This week at MK9</h2>' + bodyHtml +
      '<p style="margin-top:20px"><a href="' + ss.getUrl() + '">Open the tracker</a>' +
      (attachment ? ' — the Excel copy is attached.' : '') + '</p></div>'
  };
  if (attachment) options.attachments = [attachment];
  MailApp.sendEmail(options);
}

/* ============================================================
   HELPERS
   ============================================================ */

function recipient_() {
  // Kept out of source control on purpose: this repo is public.
  var override = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  return override || Session.getEffectiveUser().getEmail();
}

function sheetLinkHtml_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) return '';
  return '<p style="margin-top:20px"><a href="' + SpreadsheetApp.openById(id).getUrl() +
         '">Open the lead tracker</a></p>';
}

function exportXlsx_(id, name) {
  try {
    var res = UrlFetchApp.fetch(
      'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) return null;
    return res.getBlob().setName(name + '.xlsx');
  } catch (err) {
    Logger.log('xlsx export failed: ' + err);
    return null;  // digest is still worth sending without the attachment
  }
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
