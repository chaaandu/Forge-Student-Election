/**
 * The pass a device holds once it has been unlocked for voting.
 *
 * Not a credential the browser checks anything against — the password is
 * verified in Apps Script and this is the signed receipt it hands back. The
 * browser cannot forge one, and cannot read the password out of it either.
 *
 * `localStorage`, not `sessionStorage`: a device is unlocked once at the start
 * of the day, and every voter after that arrives at a fresh tab. Being asked
 * for the password between voters would put the invigilator at the keyboard for
 * all 145 of them, which is exactly the job this is supposed to remove.
 */
const KEY = 'mesa.kiosk.pass';

export function kioskPass(): string | undefined {
  try {
    return window.localStorage.getItem(KEY) ?? undefined;
  } catch {
    // Private browsing, or storage disabled. The gate will simply ask again.
    return undefined;
  }
}

export function setKioskPass(pass: string): void {
  try {
    window.localStorage.setItem(KEY, pass);
  } catch {
    /* asked again next load; nothing is lost but convenience */
  }
}

export function clearKioskPass(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
