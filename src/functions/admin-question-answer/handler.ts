import { APIGatewayProxyHandler } from 'aws-lambda';
import { batchGetItems, updateQuestionCorrectAnswers } from '../common/aws';
import { verifyAdminToken } from '../common/auth';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { decodeQuestionId } from '../common/question-id';

type QuestionItem = {
  entityType?: unknown;
  examStyle?: unknown;
  options?: unknown;
};

function parseBody(body: string | null): { questionId?: unknown; correctAnswers?: unknown } {
  try {
    return JSON.parse(body || '{}') as { questionId?: unknown; correctAnswers?: unknown };
  } catch {
    return {};
  }
}

function parseCorrectAnswers(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  const values = raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);

  if (values.length === 0) return null;
  if (new Set(values).size !== values.length) return null;
  return values;
}

function extractOptionKeys(rawOptions: unknown): Set<string> | null {
  if (!Array.isArray(rawOptions)) return null;

  const keys = rawOptions
    .map((option) => {
      if (!option || typeof option !== 'object') return '';
      const key = (option as { key?: unknown }).key;
      return typeof key === 'string' ? key.trim() : '';
    })
    .filter((key) => key.length > 0);

  if (keys.length === 0) return null;
  return new Set(keys);
}

function isMultiSelect(examStyle: unknown): boolean {
  if (typeof examStyle !== 'string') return false;
  return examStyle.toLowerCase().includes('multi');
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-question-answer', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    if (!(await verifyAdminToken(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const body = parseBody(event.body);
    const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
    if (!questionId) {
      return json(400, { message: 'questionId is required and must be an opaque question ID' });
    }

    const correctAnswers = parseCorrectAnswers(body.correctAnswers);
    if (!correctAnswers) {
      return json(400, { message: 'correctAnswers must be a non-empty unique string array' });
    }

    const key = decodeQuestionId(questionId);
    if (!key) {
      return json(400, { message: 'questionId is invalid' });
    }

    const foundItems = await batchGetItems([key]);
    if (foundItems.length === 0) {
      return json(404, { message: 'Question not found' });
    }

    const question = foundItems[0] as QuestionItem;
    if (question.entityType !== 'QUESTION') {
      return json(409, { message: 'Provided ID does not reference a QUESTION item' });
    }

    const optionKeys = extractOptionKeys(question.options);
    if (!optionKeys) {
      return json(409, { message: 'Question options are missing or invalid' });
    }

    if (correctAnswers.some((answer) => !optionKeys.has(answer))) {
      return json(400, { message: 'All correctAnswers must exist in question options' });
    }

    const multiSelect = isMultiSelect(question.examStyle);
    if (!multiSelect && correctAnswers.length !== 1) {
      return json(400, { message: 'single-select questions require exactly 1 correct answer' });
    }

    if (multiSelect && correctAnswers.length > optionKeys.size) {
      return json(400, { message: 'correctAnswers cannot exceed available options' });
    }

    const updatedAt = new Date().toISOString();
    await updateQuestionCorrectAnswers(key, correctAnswers, updatedAt);

    logInfo('Question answers updated', {
      ...requestFields,
      questionId,
      updatedAt,
      answerCount: correctAnswers.length
    });

    return json(200, { ok: true, updated: { questionId, updatedAt } });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
