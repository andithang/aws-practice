import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserSubFromEvent } from '../common/cognito-auth';
import { enrichDeviceIdentityForEvent, validateDeviceForEvent } from '../common/device';
import { json } from '../common/http';
import { errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { upsertPracticeAnswerForUser } from '../common/practice-answer-store';

type SaveBody = {
  questionKey?: unknown;
  selectedAnswers?: unknown;
  level?: unknown;
};

function parseBody(body: string | null): SaveBody {
  try {
    return JSON.parse(body || '{}') as SaveBody;
  } catch {
    return {};
  }
}

function normalizeAnswers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      unique.add(entry.trim());
    }
  }
  return Array.from(unique);
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'practice-answers-save', requestId: event.requestContext.requestId };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, message: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    const userSub = getUserSubFromEvent(event);
    if (!userSub) {
      return json(401, { message: 'Unauthorized' });
    }
    await enrichDeviceIdentityForEvent(event, deviceValidation.deviceId);

    const body = parseBody(event.body);
    const questionKey = typeof body.questionKey === 'string' ? body.questionKey.trim() : '';
    if (!questionKey) {
      return json(400, { message: 'questionKey is required' });
    }

    const selectedAnswers = normalizeAnswers(body.selectedAnswers);
    const level = typeof body.level === 'string' ? body.level.trim() : undefined;

    await upsertPracticeAnswerForUser({
      userSub,
      questionKey,
      selectedAnswers,
      level
    });

    return json(200, { ok: true });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    return json(500, { message: 'Internal server error' });
  }
};
