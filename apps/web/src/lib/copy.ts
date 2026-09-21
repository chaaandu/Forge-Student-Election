/**
 * Strings that carry legal or integrity weight.
 *
 * Kept in one file, verbatim, so a redesign cannot quietly soften the warning a
 * voter reads before an irreversible act. Tests assert the exact text.
 *
 * The voice is a printed ballot paper: plain, unhurried, and never cute about
 * the thing that matters. Where an earlier draft dressed errors in a theme,
 * these say what happened and what to do.
 */
export const COPY = {
  review: {
    warning:
      'Please check your selections carefully. Once you submit your vote, you cannot change it.',
  },
  finalCall: {
    title: 'Ready to cast your vote?',
    body: 'Once submitted, your vote cannot be changed.',
    goBack: 'Go back',
    cast: 'Cast my vote',
  },
  error: {
    alreadyVoted:
      'Our records show you have already voted. If you believe this is a mistake, please speak ' +
      'to the person running the election before you leave.',
    notOpen: 'Voting has not opened yet.',
    closed: 'Voting has closed. Your vote can no longer be accepted.',
    network:
      'Your selections are safe on this screen. We are trying again — nothing has been lost. ' +
      'If this keeps happening, tell the person running the election.',
    submitFailed:
      'Your vote was NOT recorded. Nothing has been saved. Try again, and tell the person ' +
      'running the election if it keeps failing.',
    sessionExpired:
      'Your check-in has expired. Your selections were not submitted. Please check in again.',
    notOnRoll:
      'That account is not on the voter roll for this election. Please speak to the person ' +
      'running the election.',
    noMatch:
      'No match. Check the spelling, or ask the person running the election if you think you ' +
      'should be on the roll.',
  },
  /**
   * Thank-you lines.
   *
   * These celebrate turning up, never a choice. Nothing here may imply the
   * voter picked well, or nudge an outcome.
   */
  done: [
    'Your ballot is in the box.',
    'You showed up. You voted.',
    'That is your say, recorded.',
  ],
} as const;

/** Headlines for failure states. Plain language; no decoration to decode. */
export const HEADLINE = {
  alreadyVoted: 'You have already voted',
  notOpen: 'Voting has not opened',
  closed: 'Voting has closed',
  delayed: 'Still sending',
  notRecorded: 'Your vote was not recorded',
  checkBallot: 'Check your ballot',
  checkInExpired: 'Your check-in expired',
  checkInFailed: 'Sign-in did not finish',
  unavailable: 'We could not load the election',
} as const;
