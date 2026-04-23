import { beforeAll, describe, expect, it } from 'vitest';

let getOptionTextClass: (params: {
  checked: boolean;
  isSelected: boolean;
  isCorrectOption: boolean;
  isAnswerCorrectResult: boolean;
}) => string;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://example.com';
  const module = await import('../frontend/pages/practice');
  getOptionTextClass = module.getOptionTextClass;
});

describe('practice option feedback styling', () => {
  it('keeps neutral text before result is checked', () => {
    expect(
      getOptionTextClass({
        checked: false,
        isSelected: true,
        isCorrectOption: false,
        isAnswerCorrectResult: false
      })
    ).toBe('text-slate-700 dark:text-slate-200');
  });

  it('shows selected wrong option in red when result is not correct', () => {
    expect(
      getOptionTextClass({
        checked: true,
        isSelected: true,
        isCorrectOption: false,
        isAnswerCorrectResult: false
      })
    ).toBe('text-red-600 dark:text-red-400');
  });

  it('shows correct options in green after checking', () => {
    expect(
      getOptionTextClass({
        checked: true,
        isSelected: false,
        isCorrectOption: true,
        isAnswerCorrectResult: false
      })
    ).toBe('text-emerald-600 dark:text-emerald-400');
  });
});
