import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { TableKey } from './aws';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const deviceTableName = process.env.DEVICE_TABLE_NAME!;

export async function putDeviceItem(item: Record<string, unknown>) {
  return ddb.send(
    new PutCommand({
      TableName: deviceTableName,
      Item: item
    })
  );
}

export async function getDeviceItem(key: TableKey): Promise<Record<string, unknown> | undefined> {
  const output = await ddb.send(
    new GetCommand({
      TableName: deviceTableName,
      Key: key
    })
  );
  return (output.Item as Record<string, unknown> | undefined) || undefined;
}

export async function deleteDeviceItem(key: TableKey): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: deviceTableName,
      Key: key
    })
  );
}

export async function listDevices(): Promise<Record<string, unknown>[]> {
  const results = await ddb.send(
    new ScanCommand({
      TableName: deviceTableName
    })
  );
  return results.Items || [];
}
