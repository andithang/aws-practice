import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { logInfo } from './log';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

export const tableName = process.env.TABLE_NAME!;
export type TableKey = { PK: string; SK: string };

export async function getParameterValue(parameterName: string): Promise<string> {
  const out = await ssm.send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true
    })
  );
  return out.Parameter?.Value ?? '';
}

export async function putItem(item: Record<string, unknown>) {
  return ddb.send(new PutCommand({ TableName: tableName, Item: item }));
}

export async function queryByPk(pk: string) {
  return ddb.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': pk }
  }));
}

export async function queryAllByPk(pk: string, scanIndexForward = true): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  logInfo(`Querying items with PK=${pk}, scanIndexForward=${scanIndexForward} with table ${tableName}`);

  do {
    const output = await ddb.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ExclusiveStartKey: lastEvaluatedKey,
      ScanIndexForward: scanIndexForward
    }));

    items.push(...(output.Items || []));
    lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function batchGetItems(keys: TableKey[]): Promise<Record<string, unknown>[]> {
  if (keys.length === 0) return [];

  const maxBatchSize = 100;
  const items: Record<string, unknown>[] = [];

  for (let index = 0; index < keys.length; index += maxBatchSize) {
    let requestItems: Record<string, { Keys: TableKey[] }> = {
      [tableName]: { Keys: keys.slice(index, index + maxBatchSize) }
    };

    while (Object.keys(requestItems).length > 0) {
      const output = await ddb.send(new BatchGetCommand({ RequestItems: requestItems }));
      items.push(...((output.Responses?.[tableName] as Record<string, unknown>[] | undefined) || []));
      requestItems = (output.UnprocessedKeys as Record<string, { Keys: TableKey[] }> | undefined) || {};
    }
  }

  return items;
}

export async function transactUpdateQuestionPublication(
  keys: TableKey[],
  action: 'publish' | 'deprecate',
  timestamp: string
): Promise<void> {
  if (keys.length === 0) return;

  const isPublished = action === 'publish';
  const updateExpression = isPublished
    ? 'SET #isPublished = :isPublished, #updatedAt = :updatedAt, #publishedAt = :timestamp REMOVE #deprecatedAt'
    : 'SET #isPublished = :isPublished, #updatedAt = :updatedAt, #deprecatedAt = :timestamp';

  await ddb.send(new TransactWriteCommand({
    TransactItems: keys.map((key) => ({
      Update: {
        TableName: tableName,
        Key: key,
        ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK) AND #entityType = :entityType',
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#entityType': 'entityType',
          '#isPublished': 'isPublished',
          '#updatedAt': 'updatedAt',
          '#publishedAt': 'publishedAt',
          '#deprecatedAt': 'deprecatedAt'
        },
        ExpressionAttributeValues: {
          ':entityType': 'QUESTION',
          ':isPublished': isPublished,
          ':updatedAt': timestamp,
          ':timestamp': timestamp
        }
      }
    }))
  }));
}

export async function updateStatus(pk: string, sk: string, status: string) {
  return ddb.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: pk, SK: sk },
    UpdateExpression: 'SET #s = :s, publishedAt = :p',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':p': new Date().toISOString() }
  }));
}

export async function updateQuestionCorrectAnswers(
  key: TableKey,
  correctAnswers: string[],
  updatedAt: string
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: tableName,
    Key: key,
    ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK) AND #entityType = :entityType',
    UpdateExpression: 'SET #correctAnswers = :correctAnswers, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#entityType': 'entityType',
      '#correctAnswers': 'correctAnswers',
      '#updatedAt': 'updatedAt'
    },
    ExpressionAttributeValues: {
      ':entityType': 'QUESTION',
      ':correctAnswers': correctAnswers,
      ':updatedAt': updatedAt
    }
  }));
}
