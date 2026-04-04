import { APIGatewayProxyHandler } from 'aws-lambda';
import { queryByPk } from '../common/aws';
import { randomLevel } from '../common/generation';
import { json } from '../common/http';
import { errorLogFields, logError, logInfo } from '../common/log';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'practice-questions', requestId: event.requestContext.requestId };
  logInfo('Request received', requestFields);

  try {
    const level = randomLevel();
    const pk = `LEVEL#${level}`;
    const result = await queryByPk(pk);
    const items = (result.Items || []).filter((i) => i.entityType === 'QUESTION' && i.isPublished);

    const shuffled = items.sort(() => Math.random() - 0.5).slice(0, 10);
    logInfo('Practice questions returned', { ...requestFields, level, count: shuffled.length });

    return json(200, { level, count: shuffled.length, questions: shuffled });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    return json(500, { message: 'Internal server error' });
  }
};
