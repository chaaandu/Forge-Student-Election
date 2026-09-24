import type { PublicElection } from '@/lib/api';
import { PaperBackdrop } from '@/components/paper/PaperBackdrop';
import { Button } from '@/components/ui/Button';

export interface WelcomeScreenProps {
  election: PublicElection;
  onCheckIn: () => void;
  isSeedData: boolean;
  /**
   * Arrived by a personal link (`/voting/<voter_id>`). `name` is null while the
   * server is still being asked who the link is for.
   */
  personal?: { name: string | null; onContinue: () => void };
}

/**
 * The welcome screen: two worlds, joined.
 *
 * Outside the ballot it is the ThreeUI paper — a dark room with a single
 * translucent sheet turning in it. The moment a voter checks in, everything
 * becomes the light Bauhaus plates. The transition from one to the other is the
 * point: you step out of the atmosphere and into the form.
 *
 * The backdrop is decoration and carries no meaning: it is `aria-hidden`, never
 * loaded under reduced motion, and the panel below works identically without
 * it. "Begin voting" is interactive from first paint.
 *
 * Nothing is drawn under the sheet. A static Bauhaus composition used to hold
 * the ground until the frame reported in, but the forms flashing up and then
 * dissolving a moment later read as a glitch, not as a poster — so the ground
 * is now just the dark room, and the sheet arrives into it.
 */
export function WelcomeScreen({ election, onCheckIn, isSeedData, personal }: WelcomeScreenProps) {
  const leadership = election.positions.filter((p) => p.kind === 'leadership');
  const hasHouseContests = election.positions.some((p) => p.kind === 'house-captain');

  return (
    // `flex-1`, not a viewport calc: the page is a flex column with equal
    // padding, so the panel simply fills what is left. Nothing to keep in sync.
    <div className="welcome relative flex w-full flex-1 flex-col overflow-hidden">
      {/*
        The dark room, and nothing else.

        It stays put rather than fading, because it is what the panel is drawn
        against: a slow frame, a hidden tab, reduced motion or a machine with no
        WebGL all leave this showing, and all of them should look deliberate
        rather than white or empty.
      */}
      <div className="absolute inset-0" style={{ background: '#08080a' }} aria-hidden="true" />

      <PaperBackdrop className="welcome__paper absolute inset-0" />

      {/* Everything below is the real, readable screen. */}
      <div className="relative flex flex-1 flex-col justify-end gap-8 p-4 sm:p-8">
        {/*
          No header row.

          It carried the three elementary forms and a "Mesa School of Business"
          chip. Both were removed: the sheet turning behind this panel already
          says whose election it is, in type a metre tall, and the panel below
          carries the election's own name. Two more marks in the corners were
          competing with the one thing this screen asks a voter to do.
        */}

        <div className="max-w-xl lg:max-w-[46%]">
          <div className="panel panel--raised overflow-hidden">
            {/*
              A FIXED dark field, not the page's ink.

              This strip carries yellow type, and yellow only works on something
              dark. Following --color-ink meant that on the night ground the
              strip turned cream and the label became yellow-on-cream at 1.4:1.
              The welcome panel is the dark-room poster on either ground, so its
              header is stated rather than derived.
            */}
            <div
              className="px-6 py-3 sm:px-8"
              style={{ background: 'var(--color-ink-fixed)', color: '#F2EDE1' }}
            >
              <span className="label" style={{ color: 'var(--bh-yellow)' }}>
                Voting open
              </span>
            </div>

            <div className="px-6 py-7 sm:px-8">
              <h1 className="poster" style={{ fontSize: 'clamp(2.25rem, 7vw, 4rem)' }}>
                {election.election.name}
              </h1>

              <div className="bar mt-5" style={{ maxWidth: 180 }} />

              {/*
                What is on the ballot, set as a plate label rather than a
                sentence. It is the same device as the strip above and as the
                sheet's own "ONE VOTER · ONE BALLOT", and it lets the sentence
                below carry one idea instead of three.
              */}
              <p
                className="label mt-5"
                style={{ color: 'var(--color-ink)', fontSize: 'var(--text-xs)' }}
              >
                {leadership.length} seats
                {hasHouseContests ? ' · your house captain' : ''} · 2 minutes
              </p>

              {/*
                Tighter than body leading on purpose: two short lines under a
                poster headline are a stanza, and 1.55 pulled them apart far
                enough to read as separate paragraphs.
              */}
              <p
                className="mt-4"
                style={{
                  fontSize: 'var(--text-md)',
                  lineHeight: 1.35,
                  maxWidth: '38ch',
                  textWrap: 'balance',
                }}
              >
                Pick the people who'll run your year. Nothing counts until you submit.
              </p>

              {personal ? (
                /*
                  A personal link: the name is already known, so the search is
                  skipped. "Not you?" is kept because a link can land on the
                  wrong screen - a forwarded email, a shared laptop - and the
                  person holding it must always have a way to be themselves.
                */
                <div className="mt-7 flex flex-col items-start gap-4">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={personal.onContinue}
                    disabled={personal.name === null}
                    autoFocus
                  >
                    {personal.name === null ? (
                      'Finding your ballot…'
                    ) : (
                      <>
                        Continue as {personal.name} <span aria-hidden="true">→</span>
                      </>
                    )}
                  </Button>
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    style={{ color: 'var(--color-ink-soft)', fontSize: 'var(--text-sm)' }}
                    onClick={onCheckIn}
                  >
                    Not you? Find your name
                  </button>
                </div>
              ) : (
                <div className="mt-7">
                  <Button variant="primary" size="lg" onClick={onCheckIn} autoFocus>
                    Start voting <span aria-hidden="true">→</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {isSeedData && (
            <div className="mt-5">
              <SeedDataBanner />
            </div>
          )}
        </div>

        <style>{`
          /*
            On a phone, the sheet sits at the top of the screen.

            The scene scales the sheet to fit its frame and centres it. A
            full-screen phone frame is much taller than the sheet, so the
            sheet landed in the middle of the screen, behind the panel, with a
            third of the screen empty above it. The frame is resized, not the
            scene: the ThreeUI source stays as vendored.

            At 1.4 times as tall as it is wide, the sheet fills the frame's
            width with about a tenth of the height above it (measured at
            360, 390 and 430px). Pulling the frame up by that tenth, less
            20px, puts the top of the sheet 20px from the top of the screen.
          */
          @media (max-width: 640px) {
            .welcome__paper { bottom: auto; height: 140vw; top: calc(20px - 14vw) }
          }
        `}</style>

        {/*
          No house strip here. The four crests are printed on the ballot sheet
          itself, and repeating them along the foot of the screen competed with
          it for attention without telling a voter anything new — houses are
          named again at the house contest, where they matter.
        */}
      </div>
    </div>
  );
}

/**
 * The banner warns about demo data, not about the check-in mode.
 *
 * Supervised check-in is a deliberate operating choice and needs no alarm on a
 * voter's screen. Voting on fake candidates is the state that must never pass
 * unnoticed.
 */
export function SeedDataBanner() {
  return (
    <p
      role="status"
      className="label px-5 py-3 text-center"
      style={{
        color: 'var(--color-ink-fixed)',
        background: 'var(--bh-yellow)',
        border: 'var(--rule-weight) solid var(--color-ink)',
        fontSize: 'var(--text-xs)',
      }}
    >
      Practice run. These aren't the real candidates and nothing here counts.
    </p>
  );
}
