/**
 * Strings that carry legal or integrity weight.
 *
 * Kept in one file, verbatim, so a redesign cannot quietly soften the warning a
 * voter reads before an irreversible action. Tests assert the exact text.
 */
export const COPY = {
  review: {
    warning:
      'Please check your selections carefully. Once you submit your vote, you cannot change it.',
  },
  finalCall: {
    title: 'Final call',
    body: "Final call. Once your vote departs, it can't be changed.",
    goBack: 'Go back',
    cast: 'Cast my vote',
  },
  error: {
    alreadyVoted:
      'Our records show you have already voted. If you believe this is a mistake, please speak ' +
      'to the returning officer before you leave.',
    notOpen: 'Voting has not opened yet.',
    closed: 'Voting is closed. Your vote can no longer be accepted.',
    network:
      'Your selections are safe on this screen. We are retrying — nothing has been lost. If ' +
      'this keeps happening, tell the returning officer.',
    submitFailed:
      'Your vote was NOT recorded. Nothing has been saved. Try again, and tell the returning ' +
      'officer if it keeps failing.',
    sessionExpired:
      'Your check-in has expired for security. Your selections were not submitted. Please ' +
      'check in again.',
    notOnRoll:
      'That account is not on the voter roll for this election. Please see the returning officer.',
    noMatch:
      'No match. Check the spelling, or see the returning officer if you think you should be ' +
      'on the roll.',
  },
  /**
   * Thank-you lines.
   *
   * These celebrate turning up, never a choice. Nothing here may imply the
   * voter picked well or nudge an outcome.
   */
  departed: [
    'Wheels up.',
    'You showed up. You voted.',
    'Your voice is on its way.',
    "That's democracy, Mesa style.",
  ],
} as const;

export const BOARD = {
  boarding: 'NOW BOARDING',
  checkIn: 'CHECK-IN OPEN',
  confirmed: 'PASSENGER CONFIRMED',
  ready: 'READY TO DEPART',
  finalCall: 'FINAL CALL',
  departing: 'DEPARTING',
  departed: 'DEPARTED',
  notOpen: 'BOARDING NOT OPEN',
  closed: 'GATE CLOSED',
  delayed: 'DELAYED',
  alreadyDeparted: 'ALREADY DEPARTED',
} as const;
