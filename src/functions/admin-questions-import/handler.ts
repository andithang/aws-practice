import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import Busboy from 'busboy';
import { batchGetItems, putItem, TableKey } from '../common/aws';
import { verifyAdminToken } from '../common/auth';
import { validateDeviceForEvent } from '../common/device';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';
import { parseSampleQuestionCsv } from '../common/question-import';

class RequestValidationError extends Error {}

type UploadPayload = {
  filename: string;
  csvText: string;
};

function getHeaderValue(headers: APIGatewayProxyEvent['headers'], name: string): string {
  const targetName = name.toLowerCase();
  const found = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === targetName);
  const value = found?.[1];
  return typeof value === 'string' ? value : '';
}

async function parseCsvFromMultipart(event: APIGatewayProxyEvent): Promise<UploadPayload> {
  const contentType = getHeaderValue(event.headers || {}, 'content-type');
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new RequestValidationError('Content-Type must be multipart/form-data');
  }

  const body = event.body || '';
  if (!body) {
    throw new RequestValidationError('Request body is empty');
  }

  const requestBuffer = event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');

  return new Promise<UploadPayload>((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        'content-type': contentType
      }
    });

    let foundFile = false;
    let filename = '';
    const chunks: Buffer[] = [];

    busboy.on('file', (fieldname, file, info) => {
      if (fieldname !== 'file' || foundFile) {
        file.resume();
        return;
      }

      foundFile = true;
      filename = info.filename || '';

      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on('error', (error) => {
        reject(error);
      });
    });

    busboy.on('error', (error) => {
      reject(error);
    });

    busboy.on('finish', () => {
      if (!foundFile) {
        reject(new RequestValidationError('Multipart upload must include a file field named "file"'));
        return;
      }

      if (!filename.toLowerCase().endsWith('.csv')) {
        reject(new RequestValidationError('Uploaded file must have .csv extension'));
        return;
      }

      const csvText = Buffer.concat(chunks).toString('utf8');
      if (!csvText.trim()) {
        reject(new RequestValidationError('CSV file is empty'));
        return;
      }

      resolve({ filename, csvText });
    });

    busboy.end(requestBuffer);
  });
}

function keyToString(key: TableKey): string {
  return `${key.PK}|${key.SK}`;
}

function toKey(item: Record<string, unknown>): TableKey {
  return {
    PK: String(item.PK || ''),
    SK: String(item.SK || '')
  };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-questions-import', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, message: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    if (!(await verifyAdminToken(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const upload = await parseCsvFromMultipart(event);
    const parsed = parseSampleQuestionCsv(upload.csvText);
    const keys = parsed.insertable.map((item) => toKey(item));
    const existingRows = await batchGetItems(keys);
    const existingKeySet = new Set(
      existingRows
        .map((item) => {
          if (typeof item.PK !== 'string' || typeof item.SK !== 'string') return '';
          return keyToString({ PK: item.PK, SK: item.SK });
        })
        .filter((entry) => entry.length > 0)
    );

    let skippedExistingCount = 0;
    let insertedCount = 0;

    for (const item of parsed.insertable) {
      const key = toKey(item);
      const keyString = keyToString(key);
      if (existingKeySet.has(keyString)) {
        skippedExistingCount += 1;
        continue;
      }

      await putItem(item);
      insertedCount += 1;
    }

    logInfo('CSV import completed', {
      ...requestFields,
      filename: upload.filename,
      totalRows: parsed.totalRows,
      insertedCount,
      skippedExistingCount,
      skippedInvalidCount: parsed.skippedInvalidCount,
      skippedNonQuestionCount: parsed.skippedNonQuestionCount
    });

    return json(200, {
      totalRows: parsed.totalRows,
      insertedCount,
      skippedExistingCount,
      skippedInvalidCount: parsed.skippedInvalidCount,
      skippedNonQuestionCount: parsed.skippedNonQuestionCount,
      errors: parsed.errors
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      logWarn('Import request validation failed', {
        ...requestFields,
        message: error.message
      });
      return json(400, { message: error.message });
    }

    if (error instanceof Error && error.message.includes('CSV row count exceeds limit')) {
      logWarn('Import rejected due to row limit', {
        ...requestFields,
        message: error.message
      });
      return json(400, { message: error.message });
    }

    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
