import { APIGatewayProxyHandler } from 'aws-lambda';
import { issueDeviceSeed } from '../common/device';
import { json } from '../common/http';
import { errorLogFields, logError, logInfo } from '../common/log';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'device-seed', requestId: event.requestContext.requestId };
  logInfo('Request received', requestFields);

  try {
    const session = await issueDeviceSeed();
    logInfo('Device seed issued', {
      ...requestFields,
      deviceId: session.deviceId,
      expiresAt: session.expiresAt
    });
    return json(200, session);
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
