# HANDOFF.md — where the election was left

> Written 2026-10-10, after voting finished. `CLAUDE.md` explains how the system
> works; this file says what state it was left in, what is still switched on,
> and what the next person has to decide. Read this one first if you are
> picking the project up, and `CLAUDE.md` second.
>
> This repository is public. Nothing here names a voter, a result, a
> spreadsheet id or a URL that accepts votes, and it should stay that way.

---

## 1. Where things stand

- **The election has been held.** It ran on the hosted path: the ballot on
  Vercel at `/voting`, talking to Google Apps Script, with the Google Sheet as
  the only store. The Express + SQLite server was not the system of record.
- **The votes live in the Sheet and nowhere else.** There is no database file
  to archive. The Sheet's Ballots, Voters and Results tabs are the record.
- **Nothing in this repository holds a result.** Results are in the Sheet's
  Dashboard and Results tabs.
- **`main` is at `3541194`** (2026-09-24) and that is what Vercel last built.

## 2. Where each piece lives

| Piece | Where | Who can reach it |
| --- | --- | --- |
| Source | this repository (public on GitHub) | anyone |
| Votes, roll, results | the election's Google Sheet | whoever the Sheet is shared with |
| Hosted backend | the Apps Script project bound to that Sheet | the Sheet's owner |
| Ballot and wall | a Vercel project building `apps/web` from `main` | the Vercel account owner |
| `.env`, the service-account key, `voters.json`, source PDF/XLSX | the maintainer's laptop only, git-ignored | the maintainer |

The Apps Script `/exec` URL is set as `VITE_APPS_SCRIPT_URL` in the Vercel
project's environment, and is not written down in the repository. If the Vercel
project is deleted, copy that value out first, or read it again from
*Deploy → Manage deployments* in the script editor.

## 3. Work that is not in git

On 2026-10-10 the maintainer's working tree held ten modified files that were
never committed, about 760 added lines. They are election-day changes, and
`CLAUDE.md` already describes some of them as if they were merged.

| Files | What the change does |
| --- | --- |
| `apps-script/core.gs`, `results.gs`, `setup.gs` | The Ballots tab gains a `voter_id` column, added on 2026-09-24 with voting open, by the organisers' decision. Ballots columns are found by heading rather than by position. A new menu item, *Election → Fill in voter ids on ballots*, pairs older ballots with voters by order and refuses if the tabs disagree. |
| `scripts/verify-apps-script.ts` | Scenarios covering all of the above. |
| `apps/web/src/App.tsx`, `lib/api.ts`, `screens/IdentityConfirmScreen.tsx` and their tests | *That's me* waits for the server's check-in answer, so someone who has already voted is stopped at their name and not partway through a ballot. The browser also remembers who it has seen vote. |
| `CLAUDE.md` | Three passages recording the `voter_id` exception. |

With those changes applied, `npm test` passes 545 of 545 in 42 files and
`npm run appsscript:verify` passes. (`CLAUDE.md` still quotes 537, the count at
`35632e2`.)

Two things follow, and neither can be settled from the repository:

- **The web changes were never deployed.** Vercel builds from `main`, and its
  last build was `3541194`. The ballot voters used did not have the
  *Checking the roll…* hold.
- **The `.gs` files in the Sheet may be ahead of git.** Apps Script is deployed
  by pasting, so the script editor is the only place to see what actually ran.
  Compare it with the working tree before trusting either.

Until that work is committed, the published source does not match what ran on
the day, and the only copy is one laptop.

## 4. Still switched on

Unless someone has done these since, the election is finished but not closed.

1. **The ballot still accepts votes.** `status` is `"open"` in
   `election.config.json` and in the generated `Config.gs`, and Apps Script
   enforces no closing time. Anyone on the roll who has not voted can still
   cast a ballot through the `/exec` URL. Disconnecting or deleting the Vercel
   project does not change that, because the endpoint is Google's, not
   Vercel's. To close it, either archive the web-app deployment in the script
   editor (*Deploy → Manage deployments → Archive*), or set `status` to
   `closed`, run `npm run appsscript:build && npm run appsscript:verify`,
   re-paste `Config.gs` and deploy a new version.
2. **The 5-minute `scheduledPublish` trigger** keeps appending to the Results
   tab whenever the count moves. Remove it under *Triggers* in the script
   editor once the final snapshot is taken.
3. **The Vercel project** still serves `/voting` and `/wall`, and rebuilds on
   every push to `main`.

## 5. Things to settle before this is put away

- **Who voted for whom is readable in the Sheet.** Each Ballots row carries the
  voter id. Cut the Sheet's sharing list down to the people who must have it,
  and decide how long the Sheet is kept. This is the opposite of the Express
  design, where that link is unwritable (`CLAUDE.md` §6).
- **The voter roll is public.** `apps-script/Config.gs` is tracked and holds
  145 names and school email addresses, in a public repository. Deleting the
  file does not remove it from history. Make the repository private, or rewrite
  history, or accept it knowingly (`CLAUDE.md` §20).
- **Credentials on the laptop.** The root `.env` and the service-account key
  `forge-student-elections-*.json` are git-ignored and should stay so. With the
  election over, delete the key in Google Cloud and remove the service
  account's access to the Sheet.
- **Keep a copy of the Sheet.** Download it as `.xlsx` and store it wherever
  the school keeps records, so the result does not depend on one Google
  account.

## 6. Running the next election

The system was built so that this means editing two files and not the code:
`apps/server/config/election.config.json` and `apps/server/config/voters.json`
(`CLAUDE.md` §4). Then:

```bash
npm install
npm run appsscript:build     # regenerates Config.gs from those two files
npm run appsscript:verify    # the .gs port against election-core
npm run verify               # lint, integrity checks, typecheck, tests, build
```

Decide these first, because the repository does not answer them
(`CLAUDE.md` §21):

- **Which backend.** Apps Script is what ran, and it gives a public URL with
  nothing to keep switched on. Express is the stronger system: a secret ballot
  by construction, an audit chain, and a desk at `/monitor`.
- **Whether ballots carry the voter id.** It was added mid-election this time.
  Next time it should be a decision made beforehand and told to voters.
- **Whether personal links and public name search are acceptable.** Voter ids
  follow `stu-first-last`, so a link can be guessed.
- **Whether to start from a fresh Sheet.** Recommended. Run `setup` in a new
  one and leave this year's untouched as the record.

Known stale documents: `README.md` (test counts, no mention of Apps Script),
the opening of `docs/deploying-the-wall.md`, and the "once a minute" comment in
`dashboard.gs`. The abandoned `postgres-migration` branch should not be merged.
