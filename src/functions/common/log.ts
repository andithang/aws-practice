import { APIGatewayProxyEvent } from 'aws-lambda';

type LogFields = Record<string, unknown>;

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, fields: LogFields): void {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields
  });

  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  if (level === 'WARN') {
    console.warn(line);
    return;
  }

  console.info(line);
}

export function logInfo(message: string, fields: LogFields = {}): void {
  write('INFO', message, fields);
}

export function logWarn(message: string, fields: LogFields = {}): void {
  write('WARN', message, fields);
}

export function logError(message: string, fields: LogFields = {}): void {
  write('ERROR', message, fields);
}

export function apiRequestLogFields(event: APIGatewayProxyEvent): LogFields {
  return {
    requestId: event.requestContext.requestId,
    httpMethod: event.httpMethod,
    path: event.path
  };
}

export function errorLogFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    };
  }

  return { errorMessage: String(error) };
}
