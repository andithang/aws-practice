import { describe, expect, it } from 'vitest';

import {
  parseSampleQuestionCsv,
  questionImportMaxRows,
  questionImportErrorLimit
} from '../src/functions/common/question-import';

function buildCsv(rows: string[]): string {
  return [
    '"PK","SK","batchId","correctAnswers","createdAt","date","difficultyScore","entityType","examStyle","explanation","generationProvider","isPublished","level","model","options","promptVersion","publishedAt","questionCount","questionId","status","stem","topic"',
    ...rows
  ].join('\n');
}

describe('question import CSV parser', () => {
  it('parses a UTF-8 BOM prefixed CSV', () => {
    const csvBody = buildCsv([
      '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","[{""S"":""C""}]","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[{""M"":{""key"":{""S"":""A""},""text"":{""S"":""Option A""}}},{""M"":{""key"":{""S"":""B""},""text"":{""S"":""Option B""}}},{""M"":{""key"":{""S"":""C""},""text"":{""S"":""Option C""}}},{""M"":{""key"":{""S"":""D""},""text"":{""S"":""Option D""}}}]","","","","Q001","","stem","topic"'
    ]);
    const csvWithBom = `\uFEFF${csvBody}`;

    const result = parseSampleQuestionCsv(csvWithBom, '2026-04-18T00:00:00.000Z');

    expect(result.totalRows).toBe(1);
    expect(result.insertable).toHaveLength(1);
    expect(result.skippedInvalidCount).toBe(0);
  });

  it('parses a QUESTION row in sample DynamoDB export format', () => {
    const csv = buildCsv([
      '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","[{""S"":""C""}]","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[{""M"":{""key"":{""S"":""A""},""text"":{""S"":""Option A""}}},{""M"":{""key"":{""S"":""B""},""text"":{""S"":""Option B""}}},{""M"":{""key"":{""S"":""C""},""text"":{""S"":""Option C""}}},{""M"":{""key"":{""S"":""D""},""text"":{""S"":""Option D""}}}]","","","","Q001","","stem","topic"'
    ]);

    const result = parseSampleQuestionCsv(csv, '2026-04-18T00:00:00.000Z');

    expect(result.totalRows).toBe(1);
    expect(result.insertable.length).toBe(1);
    expect(result.skippedInvalidCount).toBe(0);
    expect(result.skippedNonQuestionCount).toBe(0);

    expect(result.insertable[0]).toMatchObject({
      PK: 'LEVEL#associate',
      SK: 'DATE#2026-04-04#Q#001#BATCH#batch-1',
      entityType: 'QUESTION',
      batchId: 'batch-1',
      level: 'associate',
      isPublished: true,
      questionId: 'Q001',
      correctAnswers: ['C']
    });
    expect(result.insertable[0].options).toEqual([
      { key: 'A', text: 'Option A' },
      { key: 'B', text: 'Option B' },
      { key: 'C', text: 'Option C' },
      { key: 'D', text: 'Option D' }
    ]);
  });

  it('rejects malformed encoded JSON fields', () => {
    const csv = buildCsv([
      '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","not-json","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[{""M"":{""key"":{""S"":""A""},""text"":{""S"":""Option A""}}}]","","","","Q001","","stem","topic"'
    ]);

    const result = parseSampleQuestionCsv(csv, '2026-04-18T00:00:00.000Z');

    expect(result.insertable).toHaveLength(0);
    expect(result.skippedInvalidCount).toBe(1);
    expect(result.errors[0].reason).toContain('correctAnswers');
  });

  it('rejects single-select questions with multiple answers', () => {
    const csv = buildCsv([
      '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","[{""S"":""A""},{""S"":""B""}]","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[{""M"":{""key"":{""S"":""A""},""text"":{""S"":""Option A""}}},{""M"":{""key"":{""S"":""B""},""text"":{""S"":""Option B""}}}]","","","","Q001","","stem","topic"'
    ]);

    const result = parseSampleQuestionCsv(csv, '2026-04-18T00:00:00.000Z');

    expect(result.insertable).toHaveLength(0);
    expect(result.skippedInvalidCount).toBe(1);
    expect(result.errors[0].reason).toContain('single-select');
  });

  it('skips non-QUESTION entities', () => {
    const csv = buildCsv([
      '"LEVEL#associate","DATE#2026-04-04#BATCH#batch-1","batch-1","","2026-04-04T09:43:02.579Z","2026-04-04","","BATCH","","","","true","associate","","","","","5","","published","",""'
    ]);

    const result = parseSampleQuestionCsv(csv, '2026-04-18T00:00:00.000Z');

    expect(result.insertable).toHaveLength(0);
    expect(result.skippedNonQuestionCount).toBe(1);
    expect(result.skippedInvalidCount).toBe(0);
  });

  it('throws when row count exceeds import limit', () => {
    const row =
      '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","[{""S"":""A""}]","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[{""M"":{""key"":{""S"":""A""},""text"":{""S"":""Option A""}}}]","","","","Q001","","stem","topic"';
    const csv = buildCsv(Array.from({ length: questionImportMaxRows + 1 }, () => row));

    expect(() => parseSampleQuestionCsv(csv, '2026-04-18T00:00:00.000Z')).toThrow(
      `CSV row count exceeds limit of ${questionImportMaxRows}`
    );
  });

  it('caps collected errors at configured limit', () => {
    const row =
      '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","not-json","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[]","","","","Q001","","stem","topic"';
    const csv = buildCsv(Array.from({ length: questionImportErrorLimit + 10 }, () => row));

    const result = parseSampleQuestionCsv(csv, '2026-04-18T00:00:00.000Z');

    expect(result.skippedInvalidCount).toBe(questionImportErrorLimit + 10);
    expect(result.errors).toHaveLength(questionImportErrorLimit);
  });
});
