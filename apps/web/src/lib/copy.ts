/**
 * Strings that carry legal or integrity weight.
 *
 * Kept in one file, verbatim, so a redesign cannot quietly soften the warning a
 * voter reads before an irreversible act. Tests assert the exact text.
 *
 * VOICE
 * Warm and precise. Short sentences, second person, no jargon, no exclamation
 * marks, no filler. Say what happened, then what to do about it. Never be cute
 * about the vote itself — the warmth belongs to the person, the precision to
 * the act.
 *
 * Two rules that decide most wording:
 *   • Errors lead with what it means for the voter, not with what failed.
 *   • Nothing implies the voter chose well. We celebrate turning up, never the
 *     choice.
 */
export const COPY = {
  review: {
    // Required verbatim. Do not soften.
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
      'Our records show you have already voted. If that does not sound right, have a word with ' +
      'the person running the election before you leave.',
    notOpen: 'Voting has not opened yet.',
    closed: 'Voting has closed, so we can no longer accept a vote.',
    network:
      'Your choices are safe on this screen — nothing has been lost. We are trying again. If ' +
      'this keeps happening, tell the person running the election.',
    submitFailed:
      'Your vote was not recorded, and nothing has been saved. Try again — and if it fails a ' +
      'second time, tell the person running the election.',
    sessionExpired:
      'Your check-in timed out, so nothing was submitted. Check in again — your choices will be ' +
      'quick to make a second time.',
    notOnRoll:
      'That account is not on the roll for this election. The person running it can sort this out.',
    noMatch: 'No match yet. Try a different spelling, or ask the person running the election.',
  },
  /**
   * Thank-you lines.
   *
   * These celebrate turning up, never a choice. Nothing here may imply the
   * voter picked well, or nudge an outcome.
   */
  done: ['Your ballot is in the box.', 'One voter, one ballot. Yours is counted.', 'Thanks for turning up.'],
} as const;

/** Headlines for failure states. Plain language; nothing to decode. */
export const HEADLINE = {
  alreadyVoted: 'You have already voted',
  notOpen: 'Voting has not opened yet',
  closed: 'Voting has closed',
  delayed: 'Still sending',
  notRecorded: 'That did not go through',
  checkBallot: 'Something is missing',
  checkInExpired: 'Your check-in timed out',
  checkInFailed: 'Sign-in did not finish',
  unavailable: 'We could not load the election',
} as const;
