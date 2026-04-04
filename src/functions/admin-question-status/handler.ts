import { APIGatewayProxyHandler } from 'aws-lambda';
import { batchGetItems, transactUpdateQuestionPublication } from '../common/aws';
import { verifyAdminToken } from '../common/auth';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { decodeQuestionId } from '../common/question-id';

type Action = 'publish' | 'deprecate';

const maxBulkSize = 25;

function parseBody(body: string | null): { action?: Action; questionIds?: unknown } {
  try {
    return JSON.parse(body || '{}') as { action?: Action; questionIds?: unknown };
  } catch {
    return {};
  }
}

function normalizeQuestionIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const values = raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return values;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-question-status', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    if (!(await verifyAdminToken(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const body = parseBody(event.body || '{}');
    if (body.action !== 'publish' && body.action !== 'deprecate') {
      return json(400, { message: 'action must be one of: publish, deprecate' });
    }

    const questionIds = normalizeQuestionIds(body.questionIds);
    if (!questionIds) {
      return json(400, { message: 'questionIds must be an array of opaque IDs' });
    }

    if (questionIds.length < 1 || questionIds.length > maxBulkSize) {
      return json(400, { message: `questionIds length must be between 1 and ${maxBulkSize}` });
    }

    const uniqueIds = new Set(questionIds);
    if (uniqueIds.size !== questionIds.length) {
      return json(400, { message: 'questionIds must be unique' });
    }

    const keys = questionIds.map((id) => decodeQuestionId(id));
    if (keys.some((key) => key === null)) {
      return json(400, { message: 'One or more questionIds are invalid' });
    }

    const normalizedKeys = keys.filter((key): key is NonNullable<typeof key> => key !== null);
    const foundItems = await batchGetItems(normalizedKeys);
    if (foundItems.length !== normalizedKeys.length) {
      return json(404, { message: 'One or more questions were not found' });
    }

    const hasNonQuestionItem = foundItems.some((item) => item.entityType !== 'QUESTION');
    if (hasNonQuestionItem) {
      return json(409, { message: 'One or more IDs do not reference QUESTION items' });
    }

    const timestamp = new Date().toISOString();
    await transactUpdateQuestionPublication(normalizedKeys, body.action, timestamp);

    logInfo('Question statuses updated', {
      ...requestFields,
      action: body.action,
      count: normalizedKeys.length
    });
    return json(200, { ok: true, action: body.action, updatedCount: normalizedKeys.length });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
