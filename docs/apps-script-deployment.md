# Running the election inside Google

A permanent public URL, votes landing in the spreadsheet by themselves, results
and dashboard in the same place — and nothing to keep switched on. No database,
no laptop, no cost.

The Google Sheet is the only store. Apps Script is the server.

## Why not a static site that writes to Sheets

Because writing to a Sheet needs a credential, and anything a browser holds is
published. The key would sit in the JavaScript bundle for anyone to read, and
with it they could rewrite or delete every vote. The alternative to a server is
not "no credential" — it is "a published credential".

Apps Script runs on Google's side under the deploying account's authority, so
there is nothing to leak. It also has `LockService`, which is what makes one
person one vote enforceable: the Sheets API has neither transactions nor
locking, so the whole read-check-write happens under a script lock.

## What you deploy

Five files in `apps-script/`:

| File | What it is |
| --- | --- |
| `Config.gs` | **Generated.** The election — contests, candidates, roll, weights |
| `core.gs` | The API: check-in, eligibility, validation, casting a ballot |
| `results.gs` | Weighting, ranking, the Results tab, the five-minute refresh |
| `dashboard.gs` | Draws the Dashboard tab — turnout, who is leading, the full field |
| `setup.gs` | Creates tabs, seeds Roll and Candidates, installs the trigger |

Regenerate `Config.gs` whenever the election data changes:

```bash
npm run appsscript:build     # from election.config.json + voters.json
npm run appsscript:verify    # checks it against the tested domain core
```

**Always run the verify.** The election rules now exist twice — once in
`packages/election-core` with 500-odd tests behind it, once in the ES5 dialect
Apps Script runs. Two implementations of the same rules drift, and the way that
drift shows up is a wrong winner, computed confidently, with nothing in any log.
The check caught exactly that during the port: the ranking numbered the sorted
list 1, 2, 3, which prints an exact tie as a first and a second place.

## Steps

1. **Open the Sheet** → Extensions → Apps Script.
2. **Paste the five files in**, one per script file, names matching.
3. **Run `setup`** once. Grant the permissions it asks for. It creates any
   missing tab, seeds Roll and Candidates from `Config.gs`, and installs the
   trigger that refreshes Results every five minutes.
4. **Deploy** → New deployment → type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Copy the `/exec` URL.
5. **Point the ballot at it.** In Vercel, set `VITE_APPS_SCRIPT_URL` to that URL
   and redeploy. Locally, put it in `.env`.
6. **Remove the `/` → `/wall` redirect in `vercel.json`**, which exists only
   because the ballot could not work there. Now it can.

> **"Who has access: Anyone" is the step people miss.** Set to "Anyone with a
> Google account" and voters get a Google sign-in wall; left as "Only myself"
> the ballot receives an HTML error page instead of JSON. `lib/api.ts` names
> this case specifically, because it would otherwise surface as a parse error
> pointing at nothing.

Re-deploy (Manage deployments → edit → new version) after any script change.
The `/exec` URL stays the same.

## On the day

- The ballot is the Vercel URL. It does not change.
- Turnout, who has voted, and the live count are on the **Dashboard** tab —
  open it on a phone. That is the election desk.
- Results refresh themselves every five minutes, and only when the count has
  actually moved. **Election → Publish results now**
  on the Sheet menu forces one.

### Adding or removing people

**The Roll tab is the roll.** Edit it directly — add a row, delete a row — and
the ballot picks it up within a minute (immediately, usually: editing the tab
clears the ballot's copy of it).

| Column | What to put |
| --- | --- |
| `voter_id` | Anything unique, e.g. `emp-firstname-lastname`. Never reuse one. |
| `name` | As the voter will search for it |
| `email` | Their address; only the first two letters are ever shown |
| `type` | `student` or `employee` (any capitalisation) |
| `house` | A student's house name, e.g. `Vikings`. Leave blank for employees |

Then **Election → Check the roll.** It lists anything the ballot cannot use —
a duplicate id, a repeated email, a type it does not know, a house that is
misspelt — with the row number. Fix those before anyone on them votes: a row
that fails the check is refused at check-in rather than being given a ballot
with a contest missing.

Things worth knowing:

- **Weighting is unaffected.** Scores are shares of the votes each group
  actually cast, so ten more employees does not dilute the student 75%, and it
  does not change anyone's score until they vote.
- **Removing someone who has already voted does not remove their vote.** It
  cannot: the ballot has no link back to the person. Their vote still counts;
  they simply stop appearing in turnout.
- **Set up / repair no longer touches the roll** once it has people on it. To
  reload the tab from `Config.gs` on purpose — replacing every hand edit — use
  **Election → Replace roll from Config.gs…**
- Edits made in the tab are not copied back into `voters.json` in the
  repository. That only matters if you ever move the election back onto the
  laptop server.

### Clearing the rehearsal votes

On the Sheet: **Election → Clear all votes…**

It tells you how much is about to be destroyed, then makes you type the
election's name — `Forge Student Elections` — exactly. Two dialogs on purpose: a
single "are you sure?" is a reflex people learn to click through, and this is
the only way a cast ballot can be removed.

It clears **Voters**, **Ballots** and **Results** back to their header rows. The
Roll and Candidates tabs are left alone, so you do not have to re-seed; everyone
becomes eligible to vote again immediately.

There is no undo and no copy anywhere else. If you want the rehearsal data kept,
**File → Make a copy** of the spreadsheet first.

## What this is weaker at, stated plainly

The database version made some things structurally impossible. This does not,
and pretending otherwise would be worse than the gap itself.

- **A spreadsheet editor can alter or delete recorded votes.** Under the
  database, immutability triggers refused the write outright. **The sharing list
  on that Sheet is now the security boundary** — treat it as the ballot box.
- **There is no hash-chained audit log.** A tab can be edited by anyone with
  access, so a chain stored there proves less than one behind triggers.
- **Rate limiting is coarse.** Apps Script has no per-caller state worth the name.
- **A running count is visible** to everyone the Sheet is shared with while
  voting is open.

What is *not* weaker, because it is structural rather than enforced:

- **Ballot secrecy.** The Voters tab records that someone voted; the Ballots tab
  records what was chosen. They share no key, no ballot row has a voter column,
  and ballot timestamps are bucketed to the hour so the two cannot be re-linked
  by sorting. "Who voted for whom" is unwritable, not merely forbidden.
- **One vote per person**, re-checked against the sheet inside the lock.
- **The client is never trusted.** The token is HMAC-signed server-side and
  carries the voter id; the submission body holds only selections, so a forged
  voter id has nowhere to land.
- **Eligibility comes from configuration.** An employee's sequence does not
  contain the house captains — they are absent, not hidden.

## The Express server is still here

`apps/server` is unchanged and still the stronger system: append-only audit
chain, immutability triggers, real transactions. Run it from a laptop with
`npm run election:serve` when those matter more than a permanent URL. The two
share `packages/election-core`, which is why their results agree.
