import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', () => ({
  validateDeviceForEvent: vi.fn()
}));

vi.mock('../src/functions/common/auth', () => ({
  verifyAdminToken: vi.fn()
}));

vi.mock('../src/functions/common/aws', () => ({
  batchGetItems: vi.fn(),
  putItem: vi.fn()
}));

import { handler } from '../src/functions/admin-questions-import/handler';
import { batchGetItems, putItem } from '../src/functions/common/aws';
import { verifyAdminToken } from '../src/functions/common/auth';
import { validateDeviceForEvent } from '../src/functions/common/device';
import { questionImportMaxRows } from '../src/functions/common/question-import';

function buildCsv(rows: string[]): string {
  return [
    '"PK","SK","batchId","correctAnswers","createdAt","date","difficultyScore","entityType","examStyle","explanation","generationProvider","isPublished","level","model","options","promptVersion","publishedAt","questionCount","questionId","status","stem","topic"',
    ...rows
  ].join('\n');
}

function buildMultipartBody(csv: string, boundary = 'boundary-123'): string {
  return [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="questions.csv"',
    'Content-Type: text/csv',
    '',
    csv,
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

function buildEvent(body: string, contentType = 'multipart/form-data; boundary=boundary-123') {
  return {
    headers: {
      'content-type': contentType
    },
    httpMethod: 'POST',
    path: '/api/admin/questions/import',
    body,
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: { requestId: 'req-admin-import-1' }
  } as never;
}

const validQuestionRow =
  '"LEVEL#associate","DATE#2026-04-04#Q#001#BATCH#batch-1","batch-1","[{""S"":""C""}]","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[{""M"":{""key"":{""S"":""A""},""text"":{""S"":""Option A""}}},{""M"":{""key"":{""S"":""B""},""text"":{""S"":""Option B""}}},{""M"":{""key"":{""S"":""C""},""text"":{""S"":""Option C""}}},{""M"":{""key"":{""S"":""D""},""text"":{""S"":""Option D""}}}]","","","","Q001","","stem","topic"';

describe('admin questions import handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true });
    vi.mocked(verifyAdminToken).mockResolvedValue(true);
    vi.mocked(batchGetItems).mockResolvedValue([]);
    vi.mocked(putItem).mockResolvedValue({} as never);
  });

  it('returns device validation error before auth check', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValueOnce({
      ok: false,
      statusCode: 428,
      message: 'Device required'
    });

    const response = await handler(buildEvent(buildMultipartBody(buildCsv([validQuestionRow]))));

    expect(response.statusCode).toBe(428);
    expect(vi.mocked(verifyAdminToken)).not.toHaveBeenCalled();
  });

  it('returns 401 when admin token is invalid', async () => {
    vi.mocked(verifyAdminToken).mockResolvedValueOnce(false);

    const response = await handler(buildEvent(buildMultipartBody(buildCsv([validQuestionRow]))));

    expect(response.statusCode).toBe(401);
    expect(vi.mocked(batchGetItems)).not.toHaveBeenCalled();
  });

  it('rejects request when content-type is not multipart/form-data', async () => {
    const response = await handler(buildEvent('body', 'application/json'));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('multipart/form-data');
  });

  it('rejects multipart requests that do not include file field', async () => {
    const boundary = 'boundary-missing-file';
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="notes"',
      '',
      'not-a-file',
      `--${boundary}--`,
      ''
    ].join('\r\n');

    const response = await handler(buildEvent(body, `multipart/form-data; boundary=${boundary}`));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain('file field named "file"');
  });

  it('rejects import when CSV row count exceeds configured limit', async () => {
    const csv = buildCsv(Array.from({ length: questionImportMaxRows + 1 }, () => validQuestionRow));
    const response = await handler(buildEvent(buildMultipartBody(csv)));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toContain(String(questionImportMaxRows));
  });

  it('imports valid question rows and returns summary', async () => {
    const csv = buildCsv([validQuestionRow]);
    const response = await handler(buildEvent(buildMultipartBody(csv)));

    expect(response.statusCode).toBe(200);

    const payload = JSON.parse(response.body);
    expect(payload).toMatchObject({
      totalRows: 1,
      insertedCount: 1,
      skippedExistingCount: 0,
      skippedInvalidCount: 0,
      skippedNonQuestionCount: 0
    });
    expect(vi.mocked(batchGetItems)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(putItem)).toHaveBeenCalledTimes(1);
  });

  it('skips rows that already exist in DynamoDB', async () => {
    vi.mocked(batchGetItems).mockResolvedValueOnce([
      {
        PK: 'LEVEL#associate',
        SK: 'DATE#2026-04-04#Q#001#BATCH#batch-1',
        entityType: 'QUESTION'
      }
    ] as never);

    const csv = buildCsv([validQuestionRow]);
    const response = await handler(buildEvent(buildMultipartBody(csv)));

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload).toMatchObject({
      insertedCount: 0,
      skippedExistingCount: 1
    });
    expect(vi.mocked(putItem)).not.toHaveBeenCalled();
  });

  it('returns partial success summary for invalid and non-question rows', async () => {
    const invalidQuestion =
      '"LEVEL#associate","DATE#2026-04-04#Q#002#BATCH#batch-1","batch-1","not-json","2026-04-04T09:43:02.579Z","2026-04-04","1","QUESTION","single-select","explanation","","true","associate","","[]","","","","Q002","","stem","topic"';
    const nonQuestion =
      '"LEVEL#associate","DATE#2026-04-04#BATCH#batch-1","batch-1","","2026-04-04T09:43:02.579Z","2026-04-04","","BATCH","","","","true","associate","","","","","5","","published","",""';

    const csv = buildCsv([validQuestionRow, invalidQuestion, nonQuestion]);
    const response = await handler(buildEvent(buildMultipartBody(csv)));

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);

    expect(payload).toMatchObject({
      totalRows: 3,
      insertedCount: 1,
      skippedExistingCount: 0,
      skippedInvalidCount: 1,
      skippedNonQuestionCount: 1
    });
    expect(payload.errors).toHaveLength(1);
  });
});
