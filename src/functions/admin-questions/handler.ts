import { APIGatewayProxyHandler } from 'aws-lambda';
import { queryAllByPk } from '../common/aws';
import { verifyAdminToken } from '../common/auth';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { encodeQuestionId } from '../common/question-id';
import { Level } from '../common/types';

type QuestionRecord = {
  PK: string;
  SK: string;
  entityType: string;
  questionId?: string;
  batchId?: string;
  level?: string;
  date?: string;
  topic?: string;
  stem?: string;
  explanation?: string;
  examStyle?: string;
  isPublished?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const levels: Level[] = ['practitioner', 'associate', 'professional'];
const defaultPage = 1;
const defaultSize = 20;
const maxPageSize = 100;
const windowSize = 100;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseLevel(value: string | undefined): Level | undefined {
  if (!value) return undefined;
  return (levels as string[]).includes(value) ? (value as Level) : undefined;
}

function isValidDateInput(value: string | undefined): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeBatchIds(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function toQuestionRecord(item: Record<string, unknown>): QuestionRecord | null {
  const pk = item.PK;
  const sk = item.SK;
  const entityType = item.entityType;

  if (typeof pk !== 'string' || typeof sk !== 'string' || typeof entityType !== 'string') return null;
  if (entityType !== 'QUESTION') return null;

  return {
    PK: pk,
    SK: sk,
    entityType,
    questionId: typeof item.questionId === 'string' ? item.questionId : '',
    batchId: typeof item.batchId === 'string' ? item.batchId : '',
    level: typeof item.level === 'string' ? item.level : '',
    date: typeof item.date === 'string' ? item.date : '',
    topic: typeof item.topic === 'string' ? item.topic : '',
    stem: typeof item.stem === 'string' ? item.stem : '',
    explanation: typeof item.explanation === 'string' ? item.explanation : '',
    examStyle: typeof item.examStyle === 'string' ? item.examStyle : '',
    isPublished: Boolean(item.isPublished),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ''
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-questions', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    if (!(await verifyAdminToken(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const query = event.queryStringParameters || {};
    const requestedLevel = query.level;
    const level = parseLevel(requestedLevel);
    if (requestedLevel && !level) {
      return json(400, { message: `Invalid level. Supported values: ${levels.join(', ')}` });
    }

    const createdFrom = query.createdFrom;
    const createdTo = query.createdTo;
    if (!isValidDateInput(createdFrom) || !isValidDateInput(createdTo)) {
      return json(400, { message: 'createdFrom/createdTo must be in YYYY-MM-DD format' });
    }
    if (createdFrom && createdTo && createdFrom > createdTo) {
      return json(400, { message: 'createdFrom must be less than or equal to createdTo' });
    }

    const page = parsePositiveInt(query.page, defaultPage);
    const size = Math.min(parsePositiveInt(query.size, defaultSize), maxPageSize);
    const requestedWindow = parseNonNegativeInt(query.window, 0);
    const pagesPerWindow = Math.max(1, Math.ceil(windowSize / size));
    const batchIds = normalizeBatchIds(query.batchIds);
    const keyword = (query.keyword || '').trim().toLowerCase();

    let effectivePage = page;
    let effectiveWindow = requestedWindow;
    let didWindowRollover = false;
    if (page > pagesPerWindow) {
      effectivePage = 1;
      effectiveWindow += 1;
      didWindowRollover = true;
    }

    const targetLevels = level ? [level] : levels;
    const queriedItems = await Promise.all(
      targetLevels.map((targetLevel) => queryAllByPk(`LEVEL#${targetLevel}`, false))
    );
    const questions = queriedItems.flatMap((items) =>
      items
        .map((item) => toQuestionRecord(item))
        .filter((item): item is QuestionRecord => item !== null)
    );

    const createdFromIso = createdFrom ? `${createdFrom}T00:00:00.000Z` : undefined;
    const createdToIso = createdTo ? `${createdTo}T23:59:59.999Z` : undefined;

    const filtered = questions
      .filter((question) => {
        if (createdFromIso && (!question.createdAt || question.createdAt < createdFromIso)) return false;
        if (createdToIso && (!question.createdAt || question.createdAt > createdToIso)) return false;
        if (batchIds.size > 0 && !batchIds.has(question.batchId || '')) return false;
        if (keyword) {
          const haystack = [
            question.questionId || '',
            question.topic || '',
            question.stem || '',
            question.explanation || ''
          ].join(' ').toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        return true;
      })
      .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));

    const windowStart = effectiveWindow * windowSize;
    const windowEnd = windowStart + windowSize;
    const currentWindowQuestions = filtered.slice(windowStart, windowEnd);

    const pageStart = (effectivePage - 1) * size;
    const pageEnd = pageStart + size;
    const pageQuestions = currentWindowQuestions.slice(pageStart, pageEnd);

    const totalFiltered = filtered.length;
    const totalInWindow = currentWindowQuestions.length;
    const totalPagesInWindow = totalInWindow === 0 ? 0 : Math.ceil(totalInWindow / size);
    const hasNextWindow = totalFiltered > windowEnd;
    const hasPrevWindow = effectiveWindow > 0;

    logInfo('Admin questions listed', {
      ...requestFields,
      requestedPage: page,
      requestedWindow,
      effectivePage,
      effectiveWindow,
      size,
      totalFiltered,
      returned: pageQuestions.length,
      didWindowRollover
    });

    return json(200, {
      questions: pageQuestions.map((question) => ({
        id: encodeQuestionId({ PK: question.PK, SK: question.SK }),
        questionId: question.questionId,
        batchId: question.batchId,
        level: question.level,
        date: question.date,
        topic: question.topic,
        stem: question.stem,
        explanation: question.explanation,
        examStyle: question.examStyle,
        isPublished: Boolean(question.isPublished),
        createdAt: question.createdAt,
        updatedAt: question.updatedAt
      })),
      pagination: {
        requestedPage: page,
        effectivePage,
        size,
        windowSize,
        requestedWindow,
        effectiveWindow,
        didWindowRollover,
        hasNextWindow,
        hasPrevWindow,
        totalFiltered,
        totalInWindow,
        totalPagesInWindow
      }
    });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
