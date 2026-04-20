import { APIGatewayProxyHandler } from 'aws-lambda';
import { getUserSubFromEvent } from '../common/cognito-auth';
import { validateDeviceForEvent } from '../common/device';
import { json } from '../common/http';
import { errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { deletePracticeAnswerForUser } from '../common/practice-answer-store';

type DeleteBody = {
  questionKey?: unknown;
};

function parseBody(body: string | null): DeleteBody {
  try {
    return JSON.parse(body || '{}') as DeleteBody;
  } catch {
    return {};
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'practice-answers-delete', requestId: event.requestContext.requestId };
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

    const body = parseBody(event.body);
    const questionKey = typeof body.questionKey === 'string' ? body.questionKey.trim() : '';
    if (!questionKey) {
      return json(400, { message: 'questionKey is required' });
    }

    await deletePracticeAnswerForUser({
      userSub,
      questionKey
    });

    return json(200, { ok: true });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    return json(500, { message: 'Internal server error' });
  }
};
