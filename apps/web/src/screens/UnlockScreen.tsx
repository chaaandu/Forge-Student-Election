import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Panel } from '@/components/bauhaus/Panel';
import { Button } from '@/components/ui/Button';

export interface UnlockScreenProps {
  electionName: string;
  onUnlocked: () => void;
}

/**
 * The shared password in front of voting.
 *
 * Shown once per device and then not again for the rest of the day — the pass
 * is kept in `localStorage`, because being asked between voters would put the
 * invigilator at the keyboard for all 145 of them.
 *
 * Two things this screen is careful about:
 *
 * It is addressed to the person setting the device up, not to a voter. A voter
 * who reaches it has been handed a link they were not meant to have, and should
 * not be invited to guess — so there is no hint, no "forgot password", and the
 * failure says only that the pair was not accepted.
 *
 * And it promises nothing about secrecy. One password shared by a room is a
 * door, not an identity: it does not say who you are, and the copy does not
 * imply otherwise. Who may vote is still the roll, and one vote per person is
 * still enforced on the server.
 */
export function UnlockScreen({ electionName, onUnlocked }: UnlockScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.unlock(email, password);
      onUnlocked();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'That email and password were not accepted.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <Panel>
        <div className="px-7 py-10">
          <p className="label">{electionName}</p>
          <h1 className="headline mt-2">Unlock this device</h1>
          <p className="mt-4" style={{ color: 'var(--color-ink-soft)' }}>
            Voting on this device needs the password from the person running the election. You will
            only be asked once.
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="label">Email</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="field"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="label">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="field"
              />
            </label>

            {error && (
              <p role="alert" style={{ color: 'var(--color-alert)' }}>
                {error}
              </p>
            )}

            <div className="mt-2">
              <Button type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Unlock'}
              </Button>
            </div>
          </form>
        </div>
      </Panel>
    </div>
  );
}
