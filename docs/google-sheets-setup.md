# Connecting the Google Sheet

Everything the election produces can flow into one spreadsheet: who has voted,
the anonymous ballots, and the weighted results with a live dashboard.

**Your part is six steps and takes about ten minutes.** Everything after that is
one command.

> **Read this first.** A Google **API key will not work.** API keys can only
> *read* public sheets. Writing needs a **service account** — a robot Google
> account that you share the sheet with, exactly like sharing with a person.
> Same effort, and it actually works.

---

## 1. Make the spreadsheet

Create a new Google Sheet. Name it something obvious — *Mesa Elections 2026*.

Copy its id out of the URL. It is the part between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/1AbC...xyz/edit
                                       └──── this ────┘
```

You do **not** need to create any tabs. The setup command does that.

## 2. Make a service account

1. Go to <https://console.cloud.google.com/> and create a project (or pick one).
   Name it *Mesa Elections*.
2. Enable the Sheets API:
   <https://console.cloud.google.com/apis/library/sheets.googleapis.com> →
   **Enable**.
3. Go to **APIs & Services → Credentials → Create credentials → Service
   account**. Name it `mesa-elections`. Skip the optional role and access steps —
   it needs no project permissions at all.
4. Open the account you just made → **Keys → Add key → Create new key → JSON**.
   A `.json` file downloads. **This is a password.** Do not email it, do not put
   it in Drive, do not commit it.

## 3. Share the sheet with it

Open the downloaded JSON and find `client_email`. It looks like:

```
mesa-elections@your-project.iam.gserviceaccount.com
```

Open your spreadsheet → **Share** → paste that address → set it to **Editor** →
untick "Notify people" → **Share**.

This is the step people miss. If you skip it you get a `403`, and
`npm run sheets:check` will print the exact address to share with.

## 4. Point the app at it

Move the key file somewhere outside the project, for example
`~/mesa-elections-key.json`, then add to `apps/server/.env`:

```bash
SPREADSHEET_MODE=sheets
SHEETS_SPREADSHEET_ID=1AbC...xyz
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/Users/you/mesa-elections-key.json
```

`.env` is git-ignored. The key never reaches the browser — the whole spreadsheet
integration runs server-side.

## 5. Build the tabs

```bash
npm run sheets:check    # confirms credentials and access, tells you what is wrong
npm run sheets:setup    # creates every tab, headers, formatting and the dashboard
```

`setup` is safe to re-run. It never deletes a tab and never touches rows the
election has written — it only adds what is missing and refreshes the headers
and the Dashboard.

You will get six tabs:

| Tab | What lands in it | When |
| --- | --- | --- |
| **Dashboard** | Live formulas: turnout, turnout by house, who is winning (one row per contest), every candidate's count | updates itself |
| **Roll** | Everyone eligible — 145 rows | seeded once at setup |
| **Voters** | One row per person **as they vote** — this is your "who has voted" log | live |
| **Ballots** | One row per selection. **Anonymous** — there is no voter reference, ever | live |
| **Candidates** | The 25 candidates | seeded once at setup |
| **Results** | A full timestamped snapshot each time you publish | when you publish |

## 6. What the Dashboard shows

The Dashboard is built by `sheets:setup` and then looks after itself. Four
blocks, top to bottom:

| Block | What it is |
| --- | --- |
| **TURNOUT** | Voted, on the roll, the share, and the same split by students and employees |
| **BY HOUSE** | One row per house — voted, on roll, share, and a bar **drawn in that house's own colour** |
| **WHO IS WINNING** | **One row per contest**, in ballot order: the leader, their weighted score, a bar, and a status of `Leading`, `Tied`, `No votes yet` or `Not published yet`. A house captain's bar is that house's colour; every other is black |
| **EVERY CANDIDATE** | One row per candidate, grouped by contest: student votes and share, employee votes and share, weighted score, rank, and a bar |

Everything under **RESULTS** is scoped to the newest snapshot in the `Results`
tab, so a dashboard read halfway through a publish shows the previous complete
count rather than a half-written one. Ties are reported as ties — the winner
cell lists every name at rank 1 rather than choosing between them.

Setup rewrites the whole Dashboard each time, so adding a candidate or a house
to `election.config.json` and re-running `npm run sheets:setup` is all that is
needed to pick them up. It is the only tab that is ever cleared; it holds
formulas, never election data.

### Adding real charts

The text bars mean the Dashboard reads without any chart at all. If you want
Google's own:

**Turnout by house** — select the `House / Voted / On roll` block (the four
house rows plus their header) → **Insert → Chart** → **Bar chart** → in the
editor remove the "On roll" series if you want share rather than raw counts.

**Result for a contest** — select the `Position / Candidate / … / Weighted
score` block under **EVERY CANDIDATE** → **Insert → Chart** → **Bar chart** →
set X axis to *Candidate* and the series to *Weighted score*. Add a filter for
one position if you want a chart per contest.

The same picture, live and without a spreadsheet, is at `/monitor#results` on
the election server.

## Running it on the day

Votes reach **Voters** and **Ballots** within a few seconds of being cast —
nothing to do.

The count follows on its own. The server checks every minute
(`RESULTS_PUBLISH_INTERVAL_MS`) and, **if the ballot total has moved**, appends a
fresh timestamped snapshot to **Results**; the Dashboard reads whichever snapshot
is newest. An unchanged count publishes nothing, so the tab does not fill with
thousands of identical rows over a polling day, and the marker lives in the
database, so restarting the server does not repeat a count either.

You can still force one at any moment:

```bash
npm run results:publish
```

Each publish appends rather than overwrites, so earlier counts stay auditable.

> **A running count is visible in the spreadsheet while voting is open** to
> anyone it is shared with. If that is not acceptable, set
> `RESULTS_PUBLISH_ENABLED=false` in `apps/server/.env` and publish by hand.

## If something goes wrong

```bash
npm run sheets:check    # credentials, access, missing tabs
npm run sheets:retry    # re-send anything that failed
```

| What you see | What it means |
| --- | --- |
| `403` | The sheet is not shared with the service account. Step 3. |
| `404` | `SHEETS_SPREADSHEET_ID` is wrong, or a tab was renamed. |
| `invalid_grant` / signing error | The key was truncated when pasted. Use `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` and a real file. |
| Sheet stays empty | `SPREADSHEET_MODE` is still `spool`. Set it to `sheets` and restart the server. |

**A vote is never at risk from any of this.** The spreadsheet is a mirror, not
the record. A vote is written to the election's own database and confirmed to
the voter before the sheet is contacted at all; if Google is unreachable the
rows queue and retry, and the results are still complete and exportable from
`/api/admin/results.csv`. You can check the queue at any time:

```
GET /api/admin/sync/status     # queue depth and sheet health
```

## One thing the spreadsheet deliberately cannot tell you

**Which way any individual voted.** The `Ballots` tab has no voter column, and
neither does the database behind it — the link does not exist to export. You can
see *that* someone voted (`Voters`) and *what the electorate chose* (`Ballots`,
`Results`), and nothing joins the two. That is the design, not a limitation to
work around.
