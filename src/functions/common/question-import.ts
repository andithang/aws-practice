import { parse as parseCsv } from 'csv-parse/sync';

const allowedLevels = new Set(['practitioner', 'associate', 'professional']);

export const questionImportMaxRows = 500;
export const questionImportErrorLimit = 100;

export type QuestionImportError = {
  row: number;
  reason: string;
};

export type ParsedQuestionImport = {
  totalRows: number;
  insertable: Record<string, unknown>[];
  skippedInvalidCount: number;
  skippedNonQuestionCount: number;
  errors: QuestionImportError[];
};

type CsvRow = Record<string, string | undefined>;

function normalizeCell(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function asRequiredString(row: CsvRow, key: string): string {
  const value = normalizeCell(row[key]);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function asOptionalString(row: CsvRow, key: string): string {
  return normalizeCell(row[key]);
}

function asBoolean(row: CsvRow, key: string): boolean {
  const raw = normalizeCell(row[key]).toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${key} must be a boolean string (true/false)`);
}

function asIsoStringOrFallback(value: string, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toISOString();
}

function parseDynamoEncodedJson(raw: string, fieldName: string): unknown {
  if (!raw) {
    throw new Error(`${fieldName} is required`);
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${fieldName} must be valid JSON`);
  }
}

function parseOptions(raw: string): Array<{ key: string; text: string }> {
  const parsed = parseDynamoEncodedJson(raw, 'options');
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('options must be a non-empty array');
  }

  const normalized = parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`options[${index}] must be an object`);
    }

    const item = entry as { M?: unknown; key?: unknown; text?: unknown };
    if (item.M && typeof item.M === 'object') {
      const mapValue = item.M as {
        key?: { S?: unknown };
        text?: { S?: unknown };
      };
      const key = typeof mapValue.key?.S === 'string' ? mapValue.key.S.trim() : '';
      const text = typeof mapValue.text?.S === 'string' ? mapValue.text.S.trim() : '';
      if (!key || !text) {
        throw new Error(`options[${index}] is missing key/text`);
      }
      return { key, text };
    }

    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!key || !text) {
      throw new Error(`options[${index}] is missing key/text`);
    }
    return { key, text };
  });

  const uniqueKeys = new Set(normalized.map((option) => option.key));
  if (uniqueKeys.size !== normalized.length) {
    throw new Error('options keys must be unique');
  }

  return normalized;
}

function parseCorrectAnswers(raw: string): string[] {
  const parsed = parseDynamoEncodedJson(raw, 'correctAnswers');
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('correctAnswers must be a non-empty array');
  }

  const answers = parsed.map((entry, index) => {
    if (typeof entry === 'string') {
      const value = entry.trim();
      if (!value) throw new Error(`correctAnswers[${index}] must be non-empty`);
      return value;
    }

    if (!entry || typeof entry !== 'object') {
      throw new Error(`correctAnswers[${index}] must be a string value`);
    }

    const typed = entry as { S?: unknown };
    const value = typeof typed.S === 'string' ? typed.S.trim() : '';
    if (!value) {
      throw new Error(`correctAnswers[${index}] must be a string value`);
    }
    return value;
  });

  const uniqueAnswers = new Set(answers);
  if (uniqueAnswers.size !== answers.length) {
    throw new Error('correctAnswers must contain unique keys');
  }

  return answers;
}

function parseDifficultyScore(raw: string): number {
  if (!raw) return 1;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error('difficultyScore must be a finite number');
  }
  return parsed;
}

function validateCoreFields(
  row: CsvRow
): {
  PK: string;
  SK: string;
  batchId: string;
  level: string;
  date: string;
  examStyle: string;
  questionId: string;
  stem: string;
  topic: string;
  explanation: string;
} {
  const PK = asRequiredString(row, 'PK');
  const SK = asRequiredString(row, 'SK');
  const batchId = asRequiredString(row, 'batchId');
  const level = asRequiredString(row, 'level').toLowerCase();
  const date = asRequiredString(row, 'date');
  const examStyle = asRequiredString(row, 'examStyle');
  const questionId = asRequiredString(row, 'questionId');
  const stem = asRequiredString(row, 'stem');
  const topic = asRequiredString(row, 'topic');
  const explanation = asRequiredString(row, 'explanation');

  if (!PK.startsWith('LEVEL#')) {
    throw new Error('PK must start with LEVEL#');
  }
  if (!SK.includes('#Q#')) {
    throw new Error('SK must include #Q#');
  }
  if (!allowedLevels.has(level)) {
    throw new Error('level must be one of practitioner, associate, professional');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('date must be in YYYY-MM-DD format');
  }

  return { PK, SK, batchId, level, date, examStyle, questionId, stem, topic, explanation };
}

function parseQuestionRow(row: CsvRow, rowNumber: number, nowIso: string): Record<string, unknown> {
  const base = validateCoreFields(row);
  const options = parseOptions(asRequiredString(row, 'options'));
  const correctAnswers = parseCorrectAnswers(asRequiredString(row, 'correctAnswers'));
  const optionKeys = new Set(options.map((option) => option.key));

  if (correctAnswers.some((answer) => !optionKeys.has(answer))) {
    throw new Error('correctAnswers contains a value missing from options');
  }

  const isMultiSelect = base.examStyle.toLowerCase().includes('multi');
  if (!isMultiSelect && correctAnswers.length !== 1) {
    throw new Error('single-select questions require exactly one correct answer');
  }
  if (isMultiSelect && correctAnswers.length > optionKeys.size) {
    throw new Error('correctAnswers cannot exceed available options');
  }

  const createdAt = asIsoStringOrFallback(asOptionalString(row, 'createdAt'), nowIso);
  const updatedAt = asIsoStringOrFallback(asOptionalString(row, 'updatedAt'), createdAt);
  const publishedAt = asIsoStringOrFallback(asOptionalString(row, 'publishedAt'), updatedAt);

  return {
    PK: base.PK,
    SK: base.SK,
    entityType: 'QUESTION',
    batchId: base.batchId,
    level: base.level,
    date: base.date,
    questionId: base.questionId,
    topic: base.topic,
    stem: base.stem,
    explanation: base.explanation,
    examStyle: base.examStyle,
    options,
    correctAnswers,
    difficultyScore: parseDifficultyScore(asOptionalString(row, 'difficultyScore')),
    isPublished: asBoolean(row, 'isPublished'),
    createdAt,
    updatedAt,
    publishedAt
  };
}

export function parseSampleQuestionCsv(csvText: string, nowIso = new Date().toISOString()): ParsedQuestionImport {
  const records = parseCsv(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true
  }) as CsvRow[];

  if (records.length > questionImportMaxRows) {
    throw new Error(`CSV row count exceeds limit of ${questionImportMaxRows}`);
  }

  const insertable: Record<string, unknown>[] = [];
  const errors: QuestionImportError[] = [];
  let skippedInvalidCount = 0;
  let skippedNonQuestionCount = 0;

  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const entityType = asOptionalString(record, 'entityType').toUpperCase();

    if (entityType !== 'QUESTION') {
      skippedNonQuestionCount += 1;
      return;
    }

    try {
      insertable.push(parseQuestionRow(record, rowNumber, nowIso));
    } catch (error) {
      skippedInvalidCount += 1;
      if (errors.length < questionImportErrorLimit) {
        const reason = error instanceof Error ? error.message : 'Invalid row';
        errors.push({ row: rowNumber, reason });
      }
    }
  });

  return {
    totalRows: records.length,
    insertable,
    skippedInvalidCount,
    skippedNonQuestionCount,
    errors
  };
}
