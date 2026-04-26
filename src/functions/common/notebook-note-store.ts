import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const notebookNotesTableName = process.env.NOTEBOOK_NOTES_TABLE_NAME || '';
const noteEntityType = 'NOTE';
const noteTagEntityType = 'NOTE_TAG';
const gsi1Name = 'GSI1';

export type NotebookNoteRecord = {
  noteId: string;
  email: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type NoteTagRecord = {
  noteId: string;
  tag: string;
  updatedAt: string;
};

function userPk(email: string): string {
  return `USER#${email}`;
}

function noteSk(noteId: string): string {
  return `NOTE#${noteId}`;
}

function userTagPk(email: string, tag: string): string {
  return `USER#${email}#TAG#${tag}`;
}

function updatedNoteSk(updatedAt: string, noteId: string): string {
  return `UPDATED#${updatedAt}#NOTE#${noteId}`;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      unique.add(entry.trim());
    }
  }
  return Array.from(unique);
}

function asNotebookNoteRecord(item: Record<string, unknown> | undefined): NotebookNoteRecord | null {
  if (!item) return null;
  if (item.entityType !== noteEntityType) return null;

  const noteId = typeof item.noteId === 'string' ? item.noteId : '';
  const email = typeof item.email === 'string' ? item.email : '';
  const note = typeof item.note === 'string' ? item.note : '';
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : '';
  const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : '';

  if (!noteId || !email || !createdAt || !updatedAt) return null;

  return {
    noteId,
    email,
    note,
    tags: normalizeTags(item.tags),
    createdAt,
    updatedAt
  };
}

function asNoteTagRecord(item: Record<string, unknown> | undefined): NoteTagRecord | null {
  if (!item) return null;
  if (item.entityType !== noteTagEntityType) return null;

  const noteId = typeof item.noteId === 'string' ? item.noteId : '';
  const tag = typeof item.tag === 'string' ? item.tag : '';
  const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : '';

  if (!noteId || !tag || !updatedAt) return null;

  return { noteId, tag, updatedAt };
}

async function queryAll(input: {
  keyConditionExpression: string;
  expressionAttributeValues: Record<string, unknown>;
  indexName?: string;
  scanIndexForward?: boolean;
}): Promise<Record<string, unknown>[]> {
  if (!notebookNotesTableName) return [];

  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const output = await ddb.send(
      new QueryCommand({
        TableName: notebookNotesTableName,
        IndexName: input.indexName,
        KeyConditionExpression: input.keyConditionExpression,
        ExpressionAttributeValues: input.expressionAttributeValues,
        ScanIndexForward: input.scanIndexForward,
        ExclusiveStartKey: lastEvaluatedKey
      })
    );

    items.push(...((output.Items as Record<string, unknown>[] | undefined) || []));
    lastEvaluatedKey = output.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

export async function getNotebookNoteById(email: string, noteId: string): Promise<NotebookNoteRecord | null> {
  if (!notebookNotesTableName || !email || !noteId) return null;

  const output = await ddb.send(
    new GetCommand({
      TableName: notebookNotesTableName,
      Key: {
        PK: userPk(email),
        SK: noteSk(noteId)
      }
    })
  );

  return asNotebookNoteRecord(output.Item as Record<string, unknown> | undefined);
}

export async function listNotebookNotesByUser(email: string): Promise<NotebookNoteRecord[]> {
  if (!email) return [];

  const items = await queryAll({
    indexName: gsi1Name,
    keyConditionExpression: 'GSI1PK = :pk',
    expressionAttributeValues: {
      ':pk': userPk(email)
    },
    scanIndexForward: false
  });

  return items
    .map((item) => asNotebookNoteRecord(item))
    .filter((item): item is NotebookNoteRecord => item !== null);
}

export async function listNotebookTagLinksByUserTag(email: string, tag: string): Promise<NoteTagRecord[]> {
  if (!email || !tag) return [];

  const items = await queryAll({
    keyConditionExpression: 'PK = :pk',
    expressionAttributeValues: {
      ':pk': userTagPk(email, tag)
    },
    scanIndexForward: false
  });

  return items
    .map((item) => asNoteTagRecord(item))
    .filter((item): item is NoteTagRecord => item !== null);
}

export async function batchGetNotebookNotesByIds(email: string, noteIds: string[]): Promise<NotebookNoteRecord[]> {
  if (!notebookNotesTableName || !email || noteIds.length === 0) return [];

  const uniqueIds = Array.from(new Set(noteIds.filter((noteId) => noteId.trim().length > 0)));
  if (uniqueIds.length === 0) return [];

  const maxBatchSize = 100;
  const items: NotebookNoteRecord[] = [];

  for (let index = 0; index < uniqueIds.length; index += maxBatchSize) {
    let requestItems: Record<string, { Keys: Array<{ PK: string; SK: string }> }> = {
      [notebookNotesTableName]: {
        Keys: uniqueIds.slice(index, index + maxBatchSize).map((noteId) => ({
          PK: userPk(email),
          SK: noteSk(noteId)
        }))
      }
    };

    while (Object.keys(requestItems).length > 0) {
      const output = await ddb.send(
        new BatchGetCommand({
          RequestItems: requestItems
        })
      );

      const responseItems = (output.Responses?.[notebookNotesTableName] as Record<string, unknown>[] | undefined) || [];
      items.push(
        ...responseItems
          .map((item) => asNotebookNoteRecord(item))
          .filter((item): item is NotebookNoteRecord => item !== null)
      );

      requestItems =
        (output.UnprocessedKeys as Record<string, { Keys: Array<{ PK: string; SK: string }> }> | undefined) || {};
    }
  }

  return items;
}

export async function putNotebookNote(input: NotebookNoteRecord): Promise<void> {
  if (!notebookNotesTableName) return;

  await ddb.send(
    new PutCommand({
      TableName: notebookNotesTableName,
      Item: {
        PK: userPk(input.email),
        SK: noteSk(input.noteId),
        entityType: noteEntityType,
        noteId: input.noteId,
        email: input.email,
        note: input.note,
        tags: normalizeTags(input.tags),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        GSI1PK: userPk(input.email),
        GSI1SK: updatedNoteSk(input.updatedAt, input.noteId)
      }
    })
  );
}

export async function putNotebookTagLinks(input: {
  email: string;
  noteId: string;
  tags: string[];
  updatedAt: string;
}): Promise<void> {
  if (!notebookNotesTableName) return;

  const uniqueTags = normalizeTags(input.tags);

  await Promise.all(
    uniqueTags.map((tag) =>
      ddb.send(
        new PutCommand({
          TableName: notebookNotesTableName,
          Item: {
            PK: userTagPk(input.email, tag),
            SK: updatedNoteSk(input.updatedAt, input.noteId),
            entityType: noteTagEntityType,
            noteId: input.noteId,
            tag,
            updatedAt: input.updatedAt
          }
        })
      )
    )
  );
}

export async function deleteNotebookTagLinks(input: {
  email: string;
  noteId: string;
  tags: string[];
  updatedAt: string;
}): Promise<void> {
  if (!notebookNotesTableName) return;

  const uniqueTags = normalizeTags(input.tags);

  await Promise.all(
    uniqueTags.map((tag) =>
      ddb.send(
        new DeleteCommand({
          TableName: notebookNotesTableName,
          Key: {
            PK: userTagPk(input.email, tag),
            SK: updatedNoteSk(input.updatedAt, input.noteId)
          }
        })
      )
    )
  );
}

export async function deleteNotebookNoteById(email: string, noteId: string): Promise<void> {
  if (!notebookNotesTableName || !email || !noteId) return;

  await ddb.send(
    new DeleteCommand({
      TableName: notebookNotesTableName,
      Key: {
        PK: userPk(email),
        SK: noteSk(noteId)
      }
    })
  );
}
