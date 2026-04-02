import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});

export const tableName = process.env.TABLE_NAME!;

export async function getSecretJson(secretId: string): Promise<Record<string, string>> {
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(out.SecretString ?? '{}');
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

export async function updateStatus(pk: string, sk: string, status: string) {
  return ddb.send(new UpdateCommand({
    TableName: tableName,
    Key: { PK: pk, SK: sk },
    UpdateExpression: 'SET #s = :s, publishedAt = :p',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':s': status, ':p': new Date().toISOString() }
  }));
}
