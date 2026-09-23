/**
 * The voter a personal link was made for, or null.
 *
 * Founders and leaders vote from wherever they are, not at a booth, so they
 * are sent a link that ends in their own voter id:
 *
 *   https://…/voting/emp-varun-mehta
 *
 * The welcome screen then offers "Continue as Varun" instead of a search box.
 *
 * WHAT THIS IS AND IS NOT. The id picks a name; it does not prove who is
 * holding the phone. That is the same bargain the booth's name search already
 * makes on a public URL, and the server's guarantees are unchanged: one
 * ballot per voter, a second attempt refused, eligibility decided from the
 * roll it holds rather than anything in the address.
 *
 * Only the path is read, never a query string, so an id cannot arrive through
 * a parameter some other page appended.
 */
export function voterIdFromPath(pathname: string): string | null {
  const match = /^\/voting\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1]) return null;
  try {
    const id = decodeURIComponent(match[1]).trim();
    return id.length > 0 && id.length <= 128 ? id : null;
  } catch {
    // A malformed escape is not an id; the ordinary welcome screen is shown.
    return null;
  }
}
