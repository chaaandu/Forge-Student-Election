/**
 * Strings that carry legal or integrity weight.
 *
 * Kept in one file, verbatim, so a redesign cannot quietly soften the warning a
 * voter reads before an irreversible act. Tests assert the exact text.
 *
 * VOICE
 * Talk like a person. Short sentences, second person, no jargon, no exclamation
 * marks, no filler. Say what happened, then what to do about it. Never be cute
 * about the vote itself: the warmth belongs to the person, the precision to the
 * act.
 *
 * Three rules decide most wording.
 *
 * 1. Errors lead with what it means for the voter, not with what failed.
 * 2. Nothing implies the voter chose well. We celebrate turning up, never the
 *    choice.
 * 3. CONTRACT EVERYTHING EXCEPT THE THREE SERIOUS LINES. "isn't", "you've" and
 *    "we couldn't" are how people speak, and formal negation everywhere made
 *    the whole interface sound like a form. The exceptions are the two lines
 *    that state a vote cannot be changed and the one that states nothing was
 *    saved. Those read flat and deliberate, and the change of register is the
 *    point: when the tone stops being chatty, the sentence matters.
 *
 * No em dashes in anything a voter reads. They invite a second clause, and a
 * second clause is usually the one to cut.
 */
export const COPY = {
  review: {
    // Required verbatim by docs/product-spec.md §3.6. Do not soften.
    warning:
      'Please check your selections carefully. Once you submit your vote, you cannot change it.',
  },
  finalCall: {
    title: 'Ready to cast your vote?',
    // Serious line. Active, and deliberately not contracted.
    body: 'Once you submit, you cannot change your vote.',
    goBack: 'Go back',
    cast: 'Cast my vote',
  },
  error: {
    alreadyVoted:
      "Our records show you've already voted. If that doesn't sound right, speak to the person " +
      'running the election before you leave.',
    notOpen: "Voting hasn't opened yet.",
    closed: "Voting has closed, so we can't accept any more votes.",
    network:
      "Nothing is lost. Your choices are still on this screen and we're trying again. If this " +
      'keeps happening, tell the person running the election.',
    // Serious line. Not contracted.
    submitFailed:
      'Your vote was not recorded and nothing was saved. Try again. If it fails a second time, ' +
      'tell the person running the election.',
    sessionExpired:
      'Your check-in timed out, so nothing was submitted. Check in again, it will be quick the ' +
      'second time.',
    notOnRoll:
      "That account isn't on the roll for this election. The person running it can sort this out.",
    noMatch: 'No match yet. Try a different spelling, or ask the person running the election.',
  },
  /**
   * Thank-you lines.
   *
   * These celebrate turning up, never a choice. Nothing here may imply the
   * voter picked well, or nudge an outcome.
   */
  done: [
    'Your ballot is in the box.',
    'One voter, one ballot. Yours is counted.',
    'Thanks for turning up.',
  ],
} as const;

/** Headlines for failure states. Plain language; nothing to decode. */
export const HEADLINE = {
  alreadyVoted: "You've already voted",
  notOpen: "Voting hasn't opened yet",
  closed: 'Voting has closed',
  delayed: 'Still sending',
  notRecorded: "That didn't go through",
  checkBallot: "Something's missing",
  checkInExpired: 'Your check-in timed out',
  checkInFailed: "Sign-in didn't finish",
  unavailable: "We couldn't load the election",
} as const;
