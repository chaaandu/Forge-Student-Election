/**
 * The Dashboard — the tab you open to see who is winning.
 *
 * The Results tab is the record: thirteen columns of numbers, one row per
 * candidate, correct and almost unreadable. Answering "who is winning the
 * President contest" from it means finding the right block, spotting rank 1,
 * and mentally comparing decimals. Nobody does that at a desk with a queue in
 * front of them.
 *
 * So this is one row per CONTEST, ten rows, on one screen, with the answer in
 * the second column and a bar to make the size of the lead visible without
 * reading a number at all. The full field sits underneath for anyone who wants
 * to drill in.
 *
 * FIVE DECISIONS, and why:
 *
 *   One row per contest, at the top. The question is "who is winning each
 *   contest", so that is the shape of the answer. Everything else is detail
 *   and goes below the fold.
 *
 *   A bar, not just a number. 42.1% and 51.0% look alike in a column of
 *   decimals; two bars do not. The bar is drawn by the sheet (SPARKLINE) so it
 *   rescales with the column and needs no image.
 *
 *   Colour means HOUSE, exactly as it does in the ballot. A house captain's
 *   contest wears its house colour; everything else is ink. Colour never
 *   encodes who is ahead — that would make the leader's identity change colour
 *   as the count moved, which is how a reader learns to distrust a chart.
 *
 *   A TIE IS SHOWN AS A TIE. Both names, an amber flag, no winner. The whole
 *   pipeline refuses to break ties and it would be absurd for the one surface
 *   people actually read to quietly pick one.
 *
 *   A contest with no votes says so. It does not show a 0% winner, which is
 *   what ranking an empty field produces and reads as a real result.
 *
 * Redrawn on every publish — once a minute while voting is open.
 */

/* global CONFIG, TABS, sheet_, book_, rows_, roll_, votedSet_, resultsModel_,
   PropertiesService, SpreadsheetApp, Utilities, Session */

var DASHBOARD_TAB = 'Dashboard';

/**
 * The mark against a name, and why the tie one is not an equals sign.
 *
 * It WAS an equals sign, and it turned both tied candidates into #REF!.
 * `setValues` treats a leading "=" as a formula, so "= Priya Sharma" was
 * written as one — and a space between two names is the intersection operator
 * in Sheets, which cannot resolve, so the cell rendered an error where the
 * name should be. It only ever fired on a tie, which is the one result the
 * whole pipeline is most careful about reporting honestly, and the one nobody
 * had produced while testing.
 *
 * U+2261 reads as "identical to" and cannot begin a formula. NOTHING WRITTEN
 * INTO A DASHBOARD CELL MAY START WITH "=" unless it really is a formula; see
 * `bar_`, which is the only thing here that is.
 */
var TIE_MARK = '\u2261 ';
var LEAD_MARK = '\u25cf ';

var INK = '#141414';
var MUTED = '#707070';
var HAIRLINE = '#D8D4CC';
var AMBER = '#B0740A';
var PAPER = '#FFFFFF';

/** Columns A–F. Widths are part of the design, not an afterthought. */
var WIDTHS = [230, 230, 78, 190, 104, 190];

function houseById_(id) {
  for (var i = 0; i < CONFIG.houses.length; i += 1) {
    if (CONFIG.houses[i].id === id) return CONFIG.houses[i];
  }
  return null;
}

/**
 * A bar the sheet draws itself.
 *
 * SPARKLINE rather than a repeated block character: it fills the cell, so it
 * rescales when someone widens the column, and it carries a real colour rather
 * than a coloured glyph.
 */
function bar_(percent, colour) {
  var value = Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
  return (
    '=SPARKLINE(' +
    value +
    ',{"charttype","bar";"max",100;"color1","' +
    colour +
    '";"empty","zero"})'
  );
}

/** Turnout, counted the same way `turnout_()` counts it. */
function turnoutModel_() {
  var all = roll_();
  var voted = votedSet_();
  var out = {
    overall: { eligible: 0, voted: 0 },
    student: { eligible: 0, voted: 0 },
    employee: { eligible: 0, voted: 0 },
  };

  for (var id in all) {
    if (!Object.prototype.hasOwnProperty.call(all, id)) continue;
    var type = all[id].type;
    var did = Object.prototype.hasOwnProperty.call(voted, id);

    out.overall.eligible += 1;
    if (did) out.overall.voted += 1;
    if (out[type]) {
      out[type].eligible += 1;
      if (did) out[type].voted += 1;
    }
  }
  return out;
}

function percent_(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function leadersOf_(position) {
  var out = [];
  for (var i = 0; i < position.candidates.length; i += 1) {
    if (position.candidates[i].rank === 1) out.push(position.candidates[i]);
  }
  return out;
}

/**
 * Draw the whole tab.
 *
 * Cleared and rewritten rather than patched: a dashboard that is half this
 * publish and half the last one is worse than one that is a second late.
 */
/**
 * Redraw only when the count has actually moved.
 *
 * The publish trigger fires every minute for the whole polling day. Redrawing
 * an unchanged Dashboard is a few dozen spreadsheet operations spent to
 * produce the identical picture, and it does it while people are voting into
 * the same spreadsheet. It also clears and rewrites the tab under whoever is
 * reading it, which is a flicker they did not ask for.
 *
 * The fingerprint is the number of recorded selections, which only ever grows
 * while voting is open and drops to zero on a reset - both of which are
 * exactly when the picture should change.
 */
function dashboardIsCurrent_(fingerprint) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DASHBOARD_AT') !== String(fingerprint)) {
    props.setProperty('DASHBOARD_AT', String(fingerprint));
    return false;
  }
  return true;
}

function renderDashboard(force) {
  var book = book_();
  var existing = book.getSheetByName(DASHBOARD_TAB);

  // getLastRow, not rows_(): the fingerprint is a COUNT, and reading every
  // ballot in the sheet to find out how many there are is the expensive way to
  // ask a question the row number already answers.
  var fingerprint = Math.max(0, sheet_(TABS.ballots).getLastRow() - 1);
  if (existing && !force && dashboardIsCurrent_(fingerprint)) {
    return 'Dashboard already current.';
  }

  // Created at the front, so opening the spreadsheet lands on the answer. An
  // existing tab is left where the reader put it.
  var tab = existing || book.insertSheet(DASHBOARD_TAB, 0);
  tab.clear();

  var model = resultsModel_();
  var turnout = turnoutModel_();

  /*
    EVERY CELL'S LOOK IS BUILT INTO AN ARRAY, then applied in one call each.

    Formatting row by row is the obvious way and the wrong one: it was about
    eighty separate spreadsheet operations, repeated every minute by the
    publish trigger. Range operations are the expensive part of an Apps Script
    execution by a wide margin, and this runs on the same spreadsheet people
    are voting into.
  */
  var values = [];
  var colours = [];
  var weights = [];
  var sizes = [];
  var r = 0;

  function push(row, colour, weight, size) {
    values.push(row);
    colours.push([
      colour[0] || INK, colour[1] || INK, colour[2] || INK,
      colour[3] || INK, colour[4] || INK, colour[5] || INK,
    ]);
    weights.push([
      weight[0] || 'normal', weight[1] || 'normal', weight[2] || 'normal',
      weight[3] || 'normal', weight[4] || 'normal', weight[5] || 'normal',
    ]);
    sizes.push([
      size[0] || 11, size[1] || 11, size[2] || 11,
      size[3] || 11, size[4] || 11, size[5] || 11,
    ]);
    r += 1;
    return r;
  }

  var blank = ['', '', '', '', '', ''];
  var none = [];

  // ------------------------------------------------------------ masthead ---
  push([CONFIG.election.name, '', '', '', '', ''], [INK], ['bold'], [22]);
  push(
    [
      // The time the COUNT last moved, not the time this was drawn. An
      // always-now timestamp on an unchanged picture says "fresh" when it
      // means "redrawn", which is the opposite of what a reader needs.
      'Counted at ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'd MMM, HH:mm') +
        ' · ' + fingerprint + ' selections recorded',
      '', '', '', '', '',
    ],
    [MUTED], none, [10],
  );
  push(blank, none, none, none);

  // ------------------------------------------------------------- turnout ---
  var turnoutHead = push(['TURNOUT', '', '', '', '', ''], [INK], ['bold'], [11]);
  var turnoutFirst = r + 1;
  var groups = [
    ['Everyone', turnout.overall],
    ['Students', turnout.student],
    ['Employees', turnout.employee],
  ];
  for (var g = 0; g < groups.length; g += 1) {
    var stat = groups[g][1];
    var share = percent_(stat.voted, stat.eligible);
    push(
      [
        groups[g][0],
        stat.voted + ' of ' + stat.eligible + ' have voted',
        share / 100,
        bar_(share, INK),
        '', '',
      ],
      [INK, MUTED],
      ['bold'],
      [11, 10],
    );
  }
  var turnoutLast = r;
  push(blank, none, none, none);

  // ------------------------------------------------------ who is leading ---
  var leadHead = push(['WHO IS LEADING', '', '', '', '', ''], [INK], ['bold'], [11]);
  var leadCols = push(
    ['CONTEST', 'LEADING', 'SHARE', '', 'MARGIN', 'COUNTED ON'],
    [MUTED, MUTED, MUTED, MUTED, MUTED, MUTED],
    ['bold', 'bold', 'bold', 'bold', 'bold', 'bold'],
    [9, 9, 9, 9, 9, 9],
  );
  var leadFirst = r + 1;

  for (var p = 0; p < model.length; p += 1) {
    var position = model[p];
    var house = position.houseId ? houseById_(position.houseId) : null;
    var colour = house ? house.color : INK;
    var top = leadersOf_(position);

    if (position.votesCast === 0 || top.length === 0) {
      push(
        [position.title, 'No votes yet', '', '', '', position.basis],
        [MUTED, MUTED, MUTED, MUTED, MUTED, MUTED],
        none,
        [11, 11, 11, 11, 10, 10],
      );
      continue;
    }

    if (top.length > 1) {
      var names = [];
      for (var t = 0; t < top.length; t += 1) names.push(top[t].candidate);
      push(
        [
          position.title,
          'TIED — ' + names.join(' · '),
          top[0].score,
          bar_(top[0].score * 100, AMBER),
          'no margin',
          position.basis,
        ],
        [INK, AMBER, INK, INK, AMBER, MUTED],
        ['normal', 'bold'],
        [11, 11, 11, 11, 10, 10],
      );
      continue;
    }

    var runnerUp = null;
    for (var n = 0; n < position.candidates.length; n += 1) {
      if (position.candidates[n].rank > 1) {
        runnerUp = position.candidates[n];
        break;
      }
    }

    push(
      [
        position.title,
        top[0].candidate,
        top[0].score,
        bar_(top[0].score * 100, colour),
        runnerUp
          ? '+' + (Math.round((top[0].score - runnerUp.score) * 1000) / 10) + ' pts'
          : 'unopposed',
        position.basis,
      ],
      // The CONTEST wears the house colour, not the name. Colour here says
      // which contest this is; it never says who is ahead, because a leader
      // whose colour changed as the count moved would teach the reader to
      // distrust the chart.
      [colour, INK, INK, INK, MUTED, MUTED],
      ['bold', 'bold'],
      [11, 11, 11, 11, 10, 10],
    );
  }
  var leadLast = r;
  push(blank, none, none, none);

  // ------------------------------------------------------- the full field ---
  var fieldHead = push(['EVERY CANDIDATE', '', '', '', '', ''], [INK], ['bold'], [11]);
  var fieldCols = push(
    ['CONTEST', 'CANDIDATE', 'SCORE', '', 'STUDENTS', 'EMPLOYEES'],
    [MUTED, MUTED, MUTED, MUTED, MUTED, MUTED],
    ['bold', 'bold', 'bold', 'bold', 'bold', 'bold'],
    [9, 9, 9, 9, 9, 9],
  );
  var fieldFirst = r + 1;
  var groupStarts = [];

  for (var q = 0; q < model.length; q += 1) {
    var pos = model[q];
    var ho = pos.houseId ? houseById_(pos.houseId) : null;
    var col = ho ? ho.color : INK;
    var live = pos.votesCast > 0;

    for (var k = 0; k < pos.candidates.length; k += 1) {
      var cand = pos.candidates[k];
      var leads = live && cand.rank === 1;
      /*
        A tie is marked only where it decides the contest.

        Every candidate in a silent contest is "tied" on zero, and marking all
        of them turned a contest nobody had voted in into a screen full of tie
        flags. Lower-place ties are true but change nothing a reader is here to
        decide.
      */
      var tiedForFirst = live && cand.tied && cand.rank === 1;

      if (k === 0) groupStarts.push(r + 1);
      push(
        [
          // Named once per group. Repeated down every row it becomes noise and
          // hides where one contest ends and the next begins.
          k === 0 ? pos.title : '',
          (tiedForFirst ? TIE_MARK : leads ? LEAD_MARK : '') + cand.candidate,
          cand.score,
          bar_(cand.score * 100, leads ? col : HAIRLINE),
          cand.studentVotes + ' (' + Math.round(cand.studentPercentage) + '%)',
          cand.employeeVotes + ' (' + Math.round(cand.employeePercentage) + '%)',
        ],
        [
          k === 0 ? col : INK,
          tiedForFirst ? AMBER : INK,
          leads ? INK : MUTED,
          INK,
          MUTED,
          MUTED,
        ],
        [k === 0 ? 'bold' : 'normal', leads || tiedForFirst ? 'bold' : 'normal'],
        [11, 11, 11, 11, 10, 10],
      );
    }
  }
  var fieldLast = r;

  // --------------------------------------------------------------- write ---
  var all = tab.getRange(1, 1, values.length, 6);
  all.setValues(values);
  all.setFontColors(colours);
  all.setFontWeights(weights);
  all.setFontSizes(sizes);
  all.setVerticalAlignment('middle');

  for (var w = 0; w < WIDTHS.length; w += 1) tab.setColumnWidth(w + 1, WIDTHS[w]);
  tab.setHiddenGridlines(true);
  tab.setFrozenRows(2);

  // Turnout reads as a proportion of the roll; a contest reads as a score.
  tab.getRange(turnoutFirst, 3, turnoutLast - turnoutFirst + 1, 1)
    .setNumberFormat('0%')
    .setHorizontalAlignment('right');

  if (leadLast >= leadFirst) {
    tab.getRange(leadFirst, 3, leadLast - leadFirst + 1, 1)
      .setNumberFormat('0.0%')
      .setHorizontalAlignment('right');
    // One call for every rule between the contests.
    tab.getRange(leadFirst, 1, leadLast - leadFirst + 1, 6).setBorder(
      null, null, null, null, null, true, HAIRLINE, SpreadsheetApp.BorderStyle.SOLID);
  }

  if (fieldLast >= fieldFirst) {
    tab.getRange(fieldFirst, 3, fieldLast - fieldFirst + 1, 1)
      .setNumberFormat('0.0%')
      .setHorizontalAlignment('right');
    tab.getRange(fieldFirst, 5, fieldLast - fieldFirst + 1, 2).setHorizontalAlignment('right');
    for (var gs = 0; gs < groupStarts.length; gs += 1) {
      tab.getRange(groupStarts[gs], 1, 1, 6).setBorder(
        true, null, null, null, null, null, HAIRLINE, SpreadsheetApp.BorderStyle.SOLID);
    }
  }

  // A rule under each section heading, tying the three together as one level.
  var heads = [turnoutHead, leadHead, fieldHead];
  for (var h = 0; h < heads.length; h += 1) {
    tab.getRange(heads[h], 1, 1, 6).setBorder(
      null, null, true, null, null, null, INK, SpreadsheetApp.BorderStyle.SOLID);
  }

  /*
    The reader's view is not touched.

    `setActiveSheet` here would drag whoever is reading the Ballots tab back to
    this one every sixty seconds, because the publish trigger calls this on a
    timer. The tab is put first when it is created; after that, where someone
    is looking is their business.
  */
  return 'Dashboard refreshed.';
}
