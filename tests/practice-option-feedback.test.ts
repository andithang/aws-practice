import { beforeAll, describe, expect, it } from 'vitest';

let getOptionTextClass: (params: {
  checked: boolean;
  isSelected: boolean;
  isCorrectOption: boolean;
  isAnswerCorrectResult: boolean;
}) => string;
let getSelectedAnswerSummaries: (params: {
  options: Array<{ key: string; text: string }>;
  selected: string[];
  correctAnswers: string[];
  checked: boolean;
  isAnswerCorrectResult: boolean;
}) => Array<{ key: string; text: string; className: string }>;
let getCheckedResultsForQuestions: (
  questions: Array<{ questionId?: string; createdAt?: string }>,
  persistedAnswers: Record<string, string[]>
) => Record<string, boolean>;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://example.com';
  const module = await import('../frontend/pages/practice');
  getOptionTextClass = module.getOptionTextClass;
  getSelectedAnswerSummaries = module.getSelectedAnswerSummaries;
  getCheckedResultsForQuestions = module.getCheckedResultsForQuestions;
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

describe('selected answer summaries', () => {
  it('returns selected answers with red and green color classes after check', () => {
    expect(
      getSelectedAnswerSummaries({
        options: [
          { key: 'A', text: 'Alpha' },
          { key: 'B', text: 'Beta' },
          { key: 'C', text: 'Gamma' }
        ],
        selected: ['A', 'B'],
        correctAnswers: ['A', 'C'],
        checked: true,
        isAnswerCorrectResult: false
      })
    ).toEqual([
      { key: 'A', text: 'Alpha', className: 'text-emerald-600 dark:text-emerald-400' },
      { key: 'B', text: 'Beta', className: 'text-red-600 dark:text-red-400' }
    ]);
  });
});

describe('checked state from persisted answers', () => {
  it('marks only answered questions as checked on load', () => {
    expect(
      getCheckedResultsForQuestions(
        [
          { questionId: 'q-1', createdAt: '2026-01-01T00:00:00.000Z' },
          { questionId: 'q-2', createdAt: '2026-01-01T00:00:00.000Z' },
          {}
        ],
        {
          'q-1_2026-01-01T00:00:00.000Z': ['A'],
          'question-2': []
        }
      )
    ).toEqual({
      'q-1_2026-01-01T00:00:00.000Z': true
    });
  });
});
