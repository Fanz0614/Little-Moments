import { describe, expect, it } from 'vitest';
import { babyInputSchema } from './profile';

const schema = babyInputSchema('2026-10-20');
const valid = { nickname: ' Mia ', name: '', birthday: '2026-07-07', gender: 'girl', avatarPath: null } as const;

describe('babyInputSchema', () => {
  it('accepts a minimal profile and normalises it', () => {
    expect(schema.parse(valid)).toEqual({ nickname: 'Mia', name: null, birthday: '2026-07-07', gender: 'girl', avatarPath: null });
  });

  it('accepts today as a birthday', () => {
    expect(schema.safeParse({ ...valid, birthday: '2026-10-20' }).success).toBe(true);
  });

  it.each([
    [{ nickname: '   ' }, 'Please enter a nickname'],
    [{ nickname: 'x'.repeat(21) }, 'Nickname can be at most 20 characters'],
    [{ birthday: '2026-10-21' }, "Birthday can't be in the future"],
    [{ birthday: '1999-12-31' }, 'Please check the year'],
    [{ birthday: '2026-02-30' }, 'Please choose a valid date'],
  ])('rejects %o', (patch, message) => {
    const r = schema.safeParse({ ...valid, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(message);
  });

  it('rejects unknown genders', () => {
    expect(schema.safeParse({ ...valid, gender: 'other' }).success).toBe(false);
  });
});
