import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand
} from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const practiceAnswersTableName = process.env.PRACTICE_ANSWERS_TABLE_NAME || '';

type PracticeAnswerRecord = {
  selectedAnswers?: unknown;
};

function userPk(userSub: string): string {
  return `USER#${userSub}`;
}

function questionSk(questionKey: string): string {
  return `QUESTION#${questionKey}`;
}

function normalizeSelectedAnswers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      unique.add(entry.trim());
    }
  }
  return Array.from(unique);
}

export async function loadPracticeAnswersForUser(
  userSub: string,
  questionKeys: string[]
): Promise<Record<string, string[]>> {
  if (!practiceAnswersTableName || !userSub || questionKeys.length === 0) return {};

  const keys = questionKeys
    .map((questionKey) => questionKey.trim())
    .filter((questionKey) => questionKey.length > 0)
    .map((questionKey) => ({
      PK: userPk(userSub),
      SK: questionSk(questionKey),
      questionKey
    }));

  if (keys.length === 0) return {};

  const responses = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [practiceAnswersTableName]: {
          Keys: keys.map(({ PK, SK }) => ({ PK, SK }))
        }
      }
    })
  );

  const items = (responses.Responses?.[practiceAnswersTableName] as PracticeAnswerRecord[] | undefined) || [];
  return items.reduce<Record<string, string[]>>((acc, item) => {
    const key = typeof (item as Record<string, unknown>).questionKey === 'string'
      ? ((item as Record<string, unknown>).questionKey as string)
      : '';
    if (!key) return acc;
    acc[key] = normalizeSelectedAnswers(item.selectedAnswers);
    return acc;
  }, {});
}

export async function upsertPracticeAnswerForUser(input: {
  userSub: string;
  questionKey: string;
  selectedAnswers: string[];
  level?: string;
}): Promise<void> {
  if (!practiceAnswersTableName) return;
  const questionKey = input.questionKey.trim();
  if (!questionKey) return;

  const item: Record<string, unknown> = {
    PK: userPk(input.userSub),
    SK: questionSk(questionKey),
    entityType: 'PRACTICE_ANSWER',
    questionKey,
    selectedAnswers: normalizeSelectedAnswers(input.selectedAnswers),
    updatedAt: new Date().toISOString()
  };

  if (typeof input.level === 'string' && input.level.trim()) {
    item.level = input.level.trim();
  }

  await ddb.send(
    new PutCommand({
      TableName: practiceAnswersTableName,
      Item: item
    })
  );
}

export async function deletePracticeAnswerForUser(input: { userSub: string; questionKey: string }): Promise<void> {
  if (!practiceAnswersTableName) return;
  const questionKey = input.questionKey.trim();
  if (!questionKey) return;

  await ddb.send(
    new DeleteCommand({
      TableName: practiceAnswersTableName,
      Key: {
        PK: userPk(input.userSub),
        SK: questionSk(questionKey)
      }
    })
  );
}
