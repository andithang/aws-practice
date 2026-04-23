import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/api-client', () => ({
  apiRequest: vi.fn()
}));

import { apiRequest } from '../frontend/lib/api-client';
import {
  AdminUnauthorizedError,
  importAdminQuestionsCsv
} from '../frontend/lib/admin-api';

function createCsvFile(): File {
  return new File(['PK,SK\nLEVEL#associate,DATE#2026-04-04#Q#001#BATCH#batch-1'], 'questions.csv', {
    type: 'text/csv'
  });
}

describe('admin question import api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends multipart request to /api/admin/questions/import', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(
        JSON.stringify({
          totalRows: 1,
          insertedCount: 1,
          skippedExistingCount: 0,
          skippedInvalidCount: 0,
          skippedNonQuestionCount: 0,
          errors: []
        }),
        { status: 200 }
      )
    );

    const result = await importAdminQuestionsCsv(createCsvFile());

    expect(result.insertedCount).toBe(1);
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/admin/questions/import', expect.any(Object));

    const requestInit = vi.mocked(apiRequest).mock.calls[0][1] as RequestInit;
    expect(requestInit.method).toBe('POST');
    expect(requestInit.body).toBeInstanceOf(FormData);
  });

  it('throws AdminUnauthorizedError on 401', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response('', { status: 401 }));

    await expect(importAdminQuestionsCsv(createCsvFile())).rejects.toBeInstanceOf(AdminUnauthorizedError);
  });
});
