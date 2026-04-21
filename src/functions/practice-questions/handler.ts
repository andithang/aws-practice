import { APIGatewayProxyHandler } from 'aws-lambda';
import { enrichDeviceIdentityForEvent, validateDeviceForEvent } from '../common/device';
import { queryAllByPk } from '../common/aws';
import { getUserSubFromEvent } from '../common/cognito-auth';
import { json } from '../common/http';
import { errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { loadPracticeAnswersForUser } from '../common/practice-answer-store';
import { Level } from '../common/types';

const levels: Level[] = ['practitioner', 'associate', 'professional'];
const defaultPage = 1;
const defaultSize = 10;
const maxPageSize = 100;
const windowSize = 100;

type QuestionRecord = {
  createdAt: string;
};

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

function parseLevel(rawLevel: string | undefined): Level | undefined {
  if (!rawLevel) return undefined;
  if ((levels as string[]).includes(rawLevel)) return rawLevel as Level;
  return undefined;
}

function isQuestionRecord(item: Record<string, unknown>): item is Record<string, unknown> & QuestionRecord {
  return (
    item.entityType === 'QUESTION' &&
    item.isPublished === true &&
    typeof item.createdAt === 'string' &&
    item.createdAt.length > 0
  );
}

function questionKeyFromRecord(item: Record<string, unknown>, index: number): string {
  const questionId = typeof item.questionId === 'string' ? item.questionId : '';
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
  if (questionId && createdAt) return `${questionId}_${createdAt}`;
  return `question-${index}`;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'practice-questions', requestId: event.requestContext.requestId };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, message: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    const userSub = getUserSubFromEvent(event);
    if (!userSub) {
      logWarn('Missing Cognito sub claim', requestFields);
      return json(401, { message: 'Unauthorized' });
    }
    await enrichDeviceIdentityForEvent(event, deviceValidation.deviceId);

    const query = event.queryStringParameters || {};
    const rawLevel = query.level;
    const requestedLevel = parseLevel(rawLevel);
    if (!rawLevel) {
      return json(400, { message: `level is required. Supported values: ${levels.join(', ')}` });
    }

    if (!requestedLevel) {
      return json(400, { message: `Invalid level. Supported values: ${levels.join(', ')}` });
    }

    const page = parsePositiveInt(query.page, defaultPage);
    const size = Math.min(parsePositiveInt(query.size, defaultSize), maxPageSize);
    const requestedWindow = parseNonNegativeInt(query.window, 0);
    const pagesPerWindow = Math.max(1, Math.ceil(windowSize / size));

    let effectivePage = page;
    let effectiveWindow = requestedWindow;
    let didWindowRollover = false;
    if (page > pagesPerWindow) {
      effectivePage = 1;
      effectiveWindow += 1;
      didWindowRollover = true;
    }

    const level = requestedLevel;
    const pk = `LEVEL#${level}`;
    const queriedItems = await queryAllByPk(pk, false);
    const publishedQuestions = queriedItems
      .filter((item): item is Record<string, unknown> & QuestionRecord => isQuestionRecord(item))
      .sort((left, right) => {
        const createdCompare = right.createdAt.localeCompare(left.createdAt);
        if (createdCompare !== 0) return createdCompare;
        const leftSk = typeof left.SK === 'string' ? left.SK : '';
        const rightSk = typeof right.SK === 'string' ? right.SK : '';
        return rightSk.localeCompare(leftSk);
      });

    const windowStart = effectiveWindow * windowSize;
    const windowEnd = windowStart + windowSize;
    const currentWindowQuestions = publishedQuestions.slice(windowStart, windowEnd);

    const pageStart = (effectivePage - 1) * size;
    const pageEnd = pageStart + size;
    const pageQuestions = currentWindowQuestions.slice(pageStart, pageEnd);

    const pageQuestionKeys = pageQuestions.map((question, index) => questionKeyFromRecord(question, index));
    const persistedAnswers = await loadPracticeAnswersForUser(userSub, pageQuestionKeys);

    const totalFiltered = publishedQuestions.length;
    const totalInWindow = currentWindowQuestions.length;
    const totalPagesInWindow = totalInWindow === 0 ? 0 : Math.ceil(totalInWindow / size);
    const hasNextWindow = totalFiltered > windowEnd;
    const hasPrevWindow = effectiveWindow > 0;
    const currentPageIndex = effectiveWindow * pagesPerWindow + effectivePage;

    logInfo('Practice questions returned', {
      ...requestFields,
      level,
      requestedPage: page,
      requestedWindow,
      effectivePage,
      effectiveWindow,
      currentPageIndex,
      size,
      totalFiltered,
      returned: pageQuestions.length,
      didWindowRollover
    });

    return json(200, {
      level,
      count: pageQuestions.length,
      questions: pageQuestions,
      persistedAnswers,
      pagination: {
        requestedPage: page,
        effectivePage,
        size,
        windowSize,
        requestedWindow,
        effectiveWindow,
        currentPageIndex,
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
    return json(500, { message: 'Internal server error' });
  }
};
