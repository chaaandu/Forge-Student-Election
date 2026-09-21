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
| **Dashboard** | Live formulas: turnout, turnout by house, who is winning, every candidate's count | updates itself |
| **Roll** | Everyone eligible — 145 rows | seeded once at setup |
| **Voters** | One row per person **as they vote** — this is your "who has voted" log | live |
| **Ballots** | One row per selection. **Anonymous** — there is no voter reference, ever | live |
| **Candidates** | The 25 candidates | seeded once at setup |
| **Results** | A full timestamped snapshot each time you publish | when you publish |

## 6. Add the charts

The Dashboard has the numbers; charts take two clicks each. Open the Dashboard
tab and:

**Turnout by house** — select the `House / Voted / On roll` block (the four
house rows plus their header) → **Insert → Chart** → choose **Bar chart** → in
the editor remove the "On roll" series if you want share rather than raw counts.

**Result for a position** — select the `Position / Candidate / … / Weighted
score` block under **EVERY CANDIDATE** → **Insert → Chart** → **Bar chart** →
set X axis to *Candidate* and the series to *Weighted score*. Add a filter for
one position if you want a chart per contest.

There is already a text bar (`█████`) beside each house, so you have a readable
picture even before you insert a single chart.

---

## Running it on the day

Votes reach **Voters** and **Ballots** within a few seconds of being cast —
nothing to do.

Results are **not** automatic, on purpose: a result is something you publish
when you mean to, not something that leaks out mid-vote. When you want a fresh
count:

```bash
npm run results:publish
```

That recalculates from the ballots, appends a timestamped snapshot to
**Results**, and the Dashboard follows. Run it as often as you like — each run
appends rather than overwrites, so earlier counts stay auditable.

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
