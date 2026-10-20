import type { ProviderMessage } from '../src';

/** A raw Messages API reply whose single text block is `text`. */
export const reply = (text: string, stop_reason: string | null = 'end_turn'): ProviderMessage => ({
  stop_reason,
  content: [{ type: 'text', text }],
});

const json = (v: unknown) => reply(JSON.stringify(v));

export const NOTE = 'rolled over by herself today and looked so surprised';

/** Every case the interpreter must handle, with the outcome it must produce. */
export const FIXTURES = {
  ok: json({ title: 'Mia rolls over', caption: 'Mia rolled over all by herself today, and looked so surprised.' }),
  extraWhitespace: json({ title: '  Mia   rolls over \n', caption: ' Mia rolled over.\n\nSo surprised.  ' }),
  wrappedQuotes: json({ title: '"Mia rolls over."', caption: 'Mia rolled over.' }),
  titleNewline: json({ title: 'Mia\nrolls over', caption: '' }),
  refusal: { stop_reason: 'refusal', content: [{ type: 'text', text: '{"title": "' }] },
  truncated: reply('{"title":"Mia rolls over","caption":"Mia rolled over all by her', 'max_tokens'),
  toolUse: { stop_reason: 'tool_use', content: [{ type: 'tool_use' }] },
  noText: { stop_reason: 'end_turn', content: [] },
  invalidJson: reply('Sure! Here is your caption: {title: Mia}'),
  arrayJson: reply('["Mia", "rolled over"]'),
  missingCaption: json({ title: 'Mia rolls over' }),
  extraField: json({ title: 'Mia rolls over', caption: 'Mia rolled over.', tone: 'warm' }),
  wrongType: json({ title: 42, caption: 'Mia rolled over.' }),
  emptyTitle: json({ title: '   ', caption: 'Mia rolled over.' }),
  titleTooLong: json({ title: 'Mia rolls over for the very first time this sunny morning', caption: 'Mia rolled over.' }),
  /** 201–300 characters: accepted as is, with a long_caption warning. */
  captionLong: json({ title: 'Mia rolls over', caption: `Mia rolled over all by herself today. ${'She looked so surprised. '.repeat(7)}`.trim() }),
  /** Over 300 characters: rejected so the API asks for a rewrite. */
  captionTooLong: json({ title: 'Mia rolls over', caption: `Mia rolled over. ${'She looked so surprised. '.repeat(14)}`.trim() }),
  fabricated: json({ title: 'Mia takes her first steps', caption: 'Mia rolled over today, and she even said mama!' }),
  emojiCaption: json({ title: 'Mia rolls over', caption: `${'🎉'.repeat(150)}` }),
} satisfies Record<string, ProviderMessage>;
