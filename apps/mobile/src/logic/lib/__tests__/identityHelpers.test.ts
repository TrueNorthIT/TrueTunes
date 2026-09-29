import { describe, it, expect } from 'vitest';
import { filterUsers, isCurrentIdentity, normaliseAvatarUrl, sortUsers } from '../../../ui/social/identity/identityHelpers';

const u = (userId: string) => ({ userId });

describe('identityHelpers', () => {
  it('normalises avatar urls', () => {
    expect(normaliseAvatarUrl(null)).toBeNull();
    expect(normaliseAvatarUrl('  ')).toBeNull();
    expect(normaliseAvatarUrl('//cdn/x.png')).toBe('https://cdn/x.png');
    expect(normaliseAvatarUrl('http://cdn/x.png')).toBe('https://cdn/x.png');
    expect(normaliseAvatarUrl(' https://cdn/x.png ')).toBe('https://cdn/x.png');
  });
  it('sorts case-insensitively, dedupes and drops blanks', () => {
    expect(sortUsers([u('bob'), u('Alice'), u('BOB'), u(' '), u('carl')]).map((x) => x.userId)).toEqual(['Alice', 'bob', 'carl']);
  });
  it('filters by substring', () => {
    const list = [u('Alice'), u('Malice'), u('Bob')];
    expect(filterUsers(list, ' ALI ').map((x) => x.userId)).toEqual(['Alice', 'Malice']);
    expect(filterUsers(list, '')).toHaveLength(3);
    expect(filterUsers(list, 'zz')).toEqual([]);
  });
  it('matches current identity', () => {
    expect(isCurrentIdentity('Alice', ' alice ')).toBe(true);
    expect(isCurrentIdentity('Alice', null)).toBe(false);
    expect(isCurrentIdentity('Alice', 'Bob')).toBe(false);
  });
});
