import { describe, expect, it } from 'vitest';
import { voterIdFromPath } from '@/lib/voterLink';

describe('voterIdFromPath', () => {
  it('reads the id from a personal link', () => {
    expect(voterIdFromPath('/voting/emp_1032')).toBe('emp_1032');
    expect(voterIdFromPath('/voting/emp-varun-mehta/')).toBe('emp-varun-mehta');
  });

  it('decodes an id that was escaped on its way through an email client', () => {
    expect(voterIdFromPath('/voting/emp%2Dvarun')).toBe('emp-varun');
  });

  it('is not fooled by the ordinary ballot or the wall', () => {
    expect(voterIdFromPath('/')).toBeNull();
    expect(voterIdFromPath('/voting')).toBeNull();
    expect(voterIdFromPath('/voting/')).toBeNull();
    expect(voterIdFromPath('/wall')).toBeNull();
  });

  it('ignores anything deeper, and anything malformed', () => {
    expect(voterIdFromPath('/voting/emp_1032/extra')).toBeNull();
    expect(voterIdFromPath('/voting/%E0%A4%A')).toBeNull();
    expect(voterIdFromPath(`/voting/${'x'.repeat(200)}`)).toBeNull();
  });
});
