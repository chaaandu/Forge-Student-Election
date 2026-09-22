import type { Candidate, House, Position } from '@mesa/election-core';
import type { VoterProfile } from '@/lib/api';
import { HouseCrest } from '@/components/bauhaus/HouseCrest';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { roleFor } from '@/lib/color';
import { columnsFor } from '@/components/election/CandidateGrid';
import { TYPE_FIELD } from '@/lib/voterType';
import { COPY } from '@/lib/copy';
import { candidatePhoto } from '@/lib/candidatePhoto';

export interface ReviewScreenProps {
  voter: VoterProfile;
  steps: Position[];
  selections: Record<string, string>;
  candidateById: Map<string, Candidate>;
  houseById: Map<string, House>;
  onEdit: (positionId: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

/**
 * The completed ballot.
 *
 * Only the positions this voter was eligible for appear. An employee's ballot
 * has no House Captain section at all — not an empty one, which would read as
 * an abstention they never made.
 */
export function ReviewScreen({
  voter,
  steps,
  selections,
  candidateById,
  houseById,
  onEdit,
  onSubmit,
  onBack,
}: ReviewScreenProps) {
  const complete = steps.every((step) => selections[step.id]);
  const voterHouse = voter.houseId ? houseById.get(voter.houseId) : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* No `overflow-hidden` — see the note in PositionScreen: it would make
          this panel the scroll container and the action bar would not stick. */}
      <div className="panel panel--raised">
        <header
          className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-6 py-6 sm:px-8"
          style={{
            background: 'var(--color-ink)',
            color: 'var(--color-paper)',
            borderBottom: 'var(--rule-weight) solid var(--color-ink)',
          }}
        >
          <div className="min-w-0">
            <p className="label" style={{ color: 'var(--color-paper)', opacity: 0.7 }}>
              Almost done
            </p>
            <h1 className="poster mt-2" style={{ fontSize: 'var(--text-xl)' }}>
              Check your choices
            </h1>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {/*
                Neutral, always. Given the house colour it was the same green as
                the GLADIATORS tag — the exact collision the type colours were
                introduced to remove, one slot to the left. Colour lives in the
                corner now; the avatar carries initials.
              */}
              <Avatar name={voter.name} size="sm" />
              <span style={{ fontWeight: 600 }}>{voter.name}</span>
            </div>
          </div>

          {/*
            WHO IS VOTING, in the corner, on the heading's baseline.

            These sat under the name, which put four things on one line — block,
            name, pill, pill — and made the row read as a sentence the voter had
            to parse left to right. Up here they are a stamp on the corner of the
            sheet: glanced at, not read.

            The house is its CREST rather than the word. The four shields are
            already how a house is identified on the ballot sheet, the position
            header and every tile below; spelling it out a fifth time in a
            coloured pill was the only place the name did the work the artwork
            does everywhere else. The name is still announced — see the sr-only
            span — so nothing is lost to a screen reader, and "SAMURAI HOUSE
            CAPTAIN" is written in full on the tile below.
          */}
          <div className="flex shrink-0 items-center gap-3">
            <Tag color={TYPE_FIELD[voter.type]}>{voter.type}</Tag>
            {voterHouse && (
              <span className="bh-house-stamp">
                <HouseCrest house={voterHouse} size={30} onField />
                <span className="sr-only">{voterHouse.name}</span>
              </span>
            )}
          </div>
        </header>

        {/*
          A GRID OF FACES, not a list of names.

          Every position screen asked the voter to pick a photograph. They
          recognised a face, clicked it, and moved on — most never read the name
          at all, because they did not need to. Then the review screen turned
          the whole ballot back into text with a thumbnail beside it, and asked
          them to check it. That is a different task from the one they just did,
          using a different key, and 25 unfamiliar Indian names of similar
          length is exactly where a mis-verification hides.

          So this shows what they chose FROM: the same 4:5 portrait, at the size
          they saw it, in a grid like the one they picked it in. The name is
          still there and still legible — it has to be, it is a ballot — but it
          is the caption now, not the evidence.
        */}
        <div className="px-6 py-6 sm:px-8">
          <ul
            className="bh-review-grid list-none p-0"
            style={{ ['--cols' as string]: columnsFor(steps.length) }}
          >
            {steps.map((step, index) => {
              const candidate = candidateById.get(selections[step.id] ?? '');
              const house = step.houseId ? houseById.get(step.houseId) : undefined;
              const role = house ? roleFor(house.color) : undefined;
              const photo = candidate ? candidatePhoto(candidate) : undefined;

              return (
                <li
                  key={step.id}
                  className="bh-pick"
                  style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                >
                  {/*
                    NOT aria-hidden, even though everything visual in it is.

                    It was, and then the edit button moved inside it to be
                    positioned against the picture — which took the only control
                    on the tile out of the accessibility tree entirely. A screen
                    reader user could see seven choices and change none of them.
                    Four flow tests caught it immediately, which is the whole
                    reason they assert by accessible name rather than by class.

                    The decorative parts carry their own exemption instead: the
                    photograph has an empty alt, and the initials fallback is
                    aria-hidden. Both are already said by the name beneath.
                  */}
                  <span className="bh-pick__photo">
                    {photo ? (
                      <img src={photo} alt="" width={132} height={165} loading="lazy" />
                    ) : (
                      <span className="bh-pick__initials" aria-hidden="true">
                        {(candidate?.name ?? '?')
                          .replace(/['’]/g, '')
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                    )}
                    {/*
                      A pencil, not the word CHANGE.

                      Seven tiles each carrying an underlined CHANGE made the
                      grid read as a list of links with pictures attached — the
                      repeated word was the most rhythmic thing on the screen,
                      competing with the seven faces that are the point of it.
                      An icon says it once per tile without being read seven
                      times, and the button keeps its full accessible name.

                      Inside the PHOTO and at its foot. Beside the name it
                      competed for the line and pushed "Abhishek Kambalath" onto
                      two lines while "Preethi S" sat on one, so the grid lost
                      its baseline. At the top of the photo it sat squarely on
                      the candidate's face: the crop puts the head high
                      (the photo is top-aligned), which is exactly where the
                      button was. The bottom corner is torso and background in
                      every one of these portraits.
                    */}
                    <Button
                      variant="secondary"
                      className="bh-pick__edit"
                      onClick={() => onEdit(step.id)}
                      aria-label={`Change your pick for ${step.title}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z M14 6l4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="square"
                          strokeLinejoin="miter"
                        />
                      </svg>
                    </Button>
                  </span>

                  <span className="bh-pick__body">
                    <span className="flex items-center gap-1.5">
                      {house && <HouseCrest house={house} size={16} />}
                      {/*
                        THE SHORT TITLE, which the config has carried unread
                        since it was written.

                        A tile caption is the one place the full title does not
                        fit: "Gladiators House Captain" is 24 characters of
                        letterspaced caps beside a crest, and no tile width that
                        also keeps four across on a laptop will hold it on one
                        line. Wrapped, the house captain tile was two lines of
                        label against one everywhere else and the grid lost its
                        baseline.

                        `shortTitle` is exactly this: "Gladiators Captain", set
                        in election.config.json next to the full title, by the
                        script that generates it. It falls back to `title`,
                        which is what the six leadership positions use because
                        theirs are already short enough.

                        The full title is still what the position header says
                        and what the edit button announces, so nothing a voter
                        needs to read or hear has been shortened.
                      */}
                      <span
                        className="bh-pick__title label"
                        style={role ? { color: role.text } : undefined}
                      >
                        {step.shortTitle ?? step.title}
                      </span>
                    </span>

                    <span className="bh-pick__name">
                      {candidate ? candidate.name : 'Not chosen yet'}
                    </span>
                  </span>

                </li>
              );
            })}
          </ul>
        </div>

        {/*
          A banded notice, not a paragraph adrift in the plate.

          It was centred text with 32px above and 28px below in a full-width
          dark area, so it read as a gap in the layout that happened to contain
          a sentence. It is the last thing a voter reads before an irreversible
          act; it should look deliberate. A rule above, a sunk field, and a
          measure that matches the grid rather than the panel.
        */}
        <div className="bh-warning">
          <p className="bh-warning__text">{COPY.review.warning}</p>
        </div>

        {/*
          Only the buttons stick, not the warning above them.

          The warning is what a voter must read once; the button is what they
          must be able to REACH at any scroll position, and on a 1366x768 laptop
          it was 143px below the fold. Pinning the warning too would cost a
          quarter of that screen permanently — and it is restated in the
          confirmation dialog, which nothing can get past.
        */}
        <div className="action-bar flex flex-wrap justify-center gap-3 px-6 py-5 sm:px-8">
          <Button variant="secondary" size="lg" onClick={onBack}>
            <span aria-hidden="true">←</span> Back
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onSubmit}
            disabled={!complete}
            disabledReason="Pick someone for every position first."
          >
            Confirm &amp; Submit Vote
          </Button>
        </div>
      </div>

      <style>{`
        .bh-review-grid {
          display: grid;
          justify-content: center;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 212px));
        }
        @media (min-width: 720px) {
          /* The same count the voter picked from, so a four-candidate row and
             the review of it have the same rhythm. */
          /* Capped, so the tile — and therefore the 4:5 photo inside it — is
             the same size whether this voter has six positions at three across
             or seven at four. */
          .bh-review-grid { grid-template-columns: repeat(var(--cols), minmax(0, 212px)) }
        }

        .bh-pick {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 0 0 12px;
          border: 2px solid var(--color-ink);
          background: var(--color-card);
          animation: row-in var(--dur-enter) var(--ease-out) both;
        }

        /*
          A 4:5 PORTRAIT AT A FIXED SIZE, centred — not a full-bleed band.

          The tile used to give the photo the full tile width at a fixed height,
          which is a 2:1 letterbox: a portrait framed for 4:5 got its head and
          chin cropped away, leaving a strip of forehead. Every photograph on
          this ballot is 4:5 and the voter chose it at that shape, so the review
          has to show it at that shape or it is not the same picture.

          The ratio is safe here only because the TILE is capped at 200px. A
          ratio on an uncapped tile makes the plate enormous — at three columns
          this panel is ~800px wide, and 4:5 of a 256px tile is a 320px photo
          before any text. Capping the column instead keeps the face large, the
          shape honest, and the plate scrollable.
        */
        .bh-pick__photo {
          /* The positioning context for the edit button, so it sits at the foot
             of the PICTURE rather than at the foot of the whole tile. */
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          aspect-ratio: 4 / 5;
          overflow: hidden;
          background: var(--color-sunk);
          border-bottom: 2px solid var(--color-ink);
        }
        .bh-pick__photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          /* Top-aligned, same as CandidateCard: the import already cropped for
             headroom, so anything this frame still has to take off a photo
             should come off the bottom and never off a head. */
          object-position: center top;
        }
        .bh-pick__initials {
          font-family: var(--font-geometric);
          font-weight: 600;
          font-size: var(--text-xl);
          color: var(--color-ink-faint);
        }

        .bh-pick__body { display: block; padding: 0 10px }

        /* Tighter tracking and a smaller line box, because this label wraps to
           two lines inside a narrow tile. */
        .bh-pick__title {
          display: block;
          letter-spacing: 0.1em;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .bh-pick__name {
          display: block;
          margin-top: 3px;
          font-size: var(--text-base);
          font-weight: 600;
          line-height: 1.2;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        /* A square block in the corner, sized to the touch target rather than
           to the glyph, and out of the text flow entirely. */
        .bh-pick__edit {
          position: absolute;
          bottom: 6px;
          right: 6px;
          z-index: 1;
          padding: 0;
          width: var(--hit);
          height: var(--hit);
          min-width: var(--hit);
        }

        .bh-warning {
          border-top: var(--rule-weight) solid var(--color-ink);
          background: var(--color-sunk);
          padding: 18px 24px;
        }
        .bh-warning__text {
          max-width: 52ch;
          margin: 0 auto;
          text-align: center;
          text-wrap: balance;
          font-size: var(--text-md);
          font-weight: 500;
        }

        @keyframes row-in {
          from { opacity: 0; transform: translateY(6px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes row-in { from { opacity: 0 } to { opacity: 1 } }
        }
      `}</style>
    </div>
  );
}
