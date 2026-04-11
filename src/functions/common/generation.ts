import crypto from 'node:crypto';
import { getParameterJson, putItem } from './aws';
import { errorLogFields, logInfo, logWarn } from './log';
import { ExamQuestion, GenerationPayload, Level } from './types';

const levels: Level[] = ['practitioner', 'associate', 'professional'];
const expectedQuestionCount = 5;
const maxGenerationAttempts = 10;

export function randomLevel(): Level {
  return levels[Math.floor(Math.random() * levels.length)];
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context} must be a non-empty string`);
  }

  return value;
}

function asStringArray(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${context} must be a non-empty array`);
  }

  const normalized = value.map((entry, index) => asNonEmptyString(entry, `${context}[${index}]`));
  return normalized;
}

function validateQuestions(payload: unknown): asserts payload is GenerationPayload {
  const payloadObject = asRecord(payload, 'payload');
  const questions = payloadObject.questions;

  if (!Array.isArray(questions) || questions.length !== expectedQuestionCount) {
    throw new Error(`payload.questions must contain exactly ${expectedQuestionCount} items`);
  }

  const ids = new Set<string>();
  for (const [questionIndex, rawQuestion] of questions.entries()) {
    const question = asRecord(rawQuestion, `questions[${questionIndex}]`);
    const questionId = asNonEmptyString(question.questionId, `questions[${questionIndex}].questionId`);

    if (ids.has(questionId)) {
      throw new Error(`Duplicate questionId detected: ${questionId}`);
    }

    ids.add(questionId);

    asNonEmptyString(question.topic, `questions[${questionIndex}].topic`);
    asNonEmptyString(question.examStyle, `questions[${questionIndex}].examStyle`);
    asNonEmptyString(question.stem, `questions[${questionIndex}].stem`);
    asNonEmptyString(question.explanation, `questions[${questionIndex}].explanation`);

    if (typeof question.difficultyScore !== 'number' || !Number.isFinite(question.difficultyScore)) {
      throw new Error(`questions[${questionIndex}].difficultyScore must be a finite number`);
    }

    if (!Array.isArray(question.options) || question.options.length === 0) {
      throw new Error(`questions[${questionIndex}].options must be a non-empty array`);
    }

    const optionKeys = new Set<string>();
    for (const [optionIndex, rawOption] of question.options.entries()) {
      const option = asRecord(rawOption, `questions[${questionIndex}].options[${optionIndex}]`);
      const optionKey = asNonEmptyString(
        option.key,
        `questions[${questionIndex}].options[${optionIndex}].key`
      );
      asNonEmptyString(option.text, `questions[${questionIndex}].options[${optionIndex}].text`);
      optionKeys.add(optionKey);
    }

    const correctAnswers = asStringArray(
      question.correctAnswers,
      `questions[${questionIndex}].correctAnswers`
    );
    if (correctAnswers.some((answer) => !optionKeys.has(answer))) {
      throw new Error(`questions[${questionIndex}].correctAnswers contains keys missing from options`);
    }
  }
}

function extractGeminiText(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined;
  }

  const firstCandidate = candidates[0];
  if (typeof firstCandidate !== 'object' || firstCandidate === null) {
    return undefined;
  }

  const content = (firstCandidate as { content?: unknown }).content;
  if (typeof content !== 'object' || content === null) {
    return undefined;
  }

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    return undefined;
  }

  const firstPart = parts[0];
  if (typeof firstPart !== 'object' || firstPart === null) {
    return undefined;
  }

  const text = (firstPart as { text?: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

async function callGemini(level: Level): Promise<GenerationPayload> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const secret = await getParameterJson(process.env.GEMINI_API_KEY_PARAMETER_NAME!);
  const apiKey = process.env.GEMINI_API_KEY || secret.apiKey;
  const prompt = [
    'Task: Generate high-quality AWS certification practice questions.',
    `Target level: ${level}.`,
    `Output exactly ${expectedQuestionCount} questions.`,
    'Return only valid JSON. Do not return markdown, code fences, or extra text.',
    '',
    'Required output schema:',
    '{',
    '  "questions": [',
    '    {',
    '      "questionId": "Q001",',
    '      "topic": "short AWS topic name",',
    '      "examStyle": "single-select or multi-select",',
    '      "stem": "scenario-based question statement",',
    '      "options": [',
    '        { "key": "A", "text": "option text" },',
    '        { "key": "B", "text": "option text" },',
    '        { "key": "C", "text": "option text" },',
    '        { "key": "D", "text": "option text" }',
    '      ],',
    '      "correctAnswers": ["A"],',
    '      "explanation": "why correct and why others are not",',
    '      "difficultyScore": 1',
    '    }',
    '  ]',
    '}',
    '',
    'Hard constraints:',
    `1. questions must be an array of exactly ${expectedQuestionCount} objects.`,
    '2. questionId must be non-empty and unique across all questions.',
    '3. Each question must include all schema fields with non-empty strings where applicable.',
    '4. options must be an array of exactly 4 objects with unique keys A, B, C, D.',
    '5. correctAnswers must contain one or more option keys and every key must exist in options.',
    '6. difficultyScore must be a finite number from 1 to 10.',
    '7. Use realistic AWS service names, limits, and architecture trade-offs.',
    '8. Keep stems and explanations concise and practical for exam prep.',
    '',
    'Final check before responding: ensure the JSON parses correctly and strictly matches the schema and constraints.'
  ].join('\n');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!res.ok) {
    throw new Error(`Gemini request failed with status ${res.status}`);
  }

  const body: unknown = await res.json();
  const text = extractGeminiText(body);
  if (!text) throw new Error('Gemini returned empty response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned invalid JSON payload');
  }

  validateQuestions(parsed);

  return parsed;
}

async function persistBatch(level: Level, payload: GenerationPayload): Promise<{ batchId: string; count: number }> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const batchId = crypto.randomUUID();
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const pk = `LEVEL#${level}`;
  const batchSk = `DATE#${date}#BATCH#${batchId}`;

  await putItem({
    PK: pk,
    SK: batchSk,
    entityType: 'BATCH',
    batchId,
    level,
    date,
    status: 'published',
    questionCount: payload.questions.length,
    model,
    promptVersion: 'v2',
    createdAt: now.toISOString(),
    publishedAt: now.toISOString()
  });

  await Promise.all(payload.questions.map((q: ExamQuestion, idx: number) => {
    const sk = `DATE#${date}#Q#${String(idx + 1).padStart(3, '0')}#BATCH#${batchId}`;
    return putItem({
      PK: pk,
      SK: sk,
      entityType: 'QUESTION',
      questionId: q.questionId,
      batchId,
      level,
      date,
      topic: q.topic,
      examStyle: q.examStyle,
      stem: q.stem,
      options: q.options,
      correctAnswers: q.correctAnswers,
      explanation: q.explanation,
      difficultyScore: q.difficultyScore,
      isPublished: true,
      createdAt: now.toISOString()
    });
  }));

  return { batchId, count: payload.questions.length };
}

export async function generateAndPersistBatch(): Promise<{ batchId: string; level: Level; count: number }> {
  const level = randomLevel();
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxGenerationAttempts; attempt += 1) {
    try {
      logInfo('Generation attempt started', { component: 'generation', level, attempt, maxGenerationAttempts });
      const payload = await callGemini(level);
      const persisted = await persistBatch(level, payload);
      logInfo('Generation attempt succeeded', {
        component: 'generation',
        level,
        attempt,
        batchId: persisted.batchId,
        count: persisted.count
      });
      return { level, ...persisted };
    } catch (error) {
      lastError = error;
      logWarn('Generation attempt failed', {
        component: 'generation',
        level,
        attempt,
        maxGenerationAttempts,
        ...errorLogFields(error)
      });
    }
  }

  throw new Error(`Failed to generate and persist batch after ${maxGenerationAttempts} attempts`, {
    cause: lastError instanceof Error ? lastError : undefined
  });
}
