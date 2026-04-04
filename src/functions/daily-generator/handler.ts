import { APIGatewayProxyResult, Context } from 'aws-lambda';
import { generateAndPersistBatch } from '../common/generation';
import { errorLogFields, logError, logInfo } from '../common/log';

export const handler = async (_event: unknown, context: Context): Promise<APIGatewayProxyResult> => {
  const requestFields = { lambda: 'daily-generator', requestId: context.awsRequestId };
  logInfo('Scheduled generation started', requestFields);

  try {
    const result = await generateAndPersistBatch();
    logInfo('Scheduled generation completed', { ...requestFields, ...result });
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
  } catch (error) {
    logError('Scheduled generation failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
