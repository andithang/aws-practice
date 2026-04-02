import crypto from 'node:crypto';
import { getSecretJson, putItem } from './aws';
import { ExamQuestion, GenerationPayload, Level } from './types';

const levels: Level[] = ['practitioner', 'associate', 'professional'];

export function randomLevel(): Level {
  return levels[Math.floor(Math.random() * levels.length)];
}

function validateQuestions(payload: GenerationPayload) {
  const ids = new Set<string>();
  for (const q of payload.questions) {
    if (!q.questionId || ids.has(q.questionId)) throw new Error('Duplicate or missing questionId');
    ids.add(q.questionId);
    if (!q.options?.length || !q.correctAnswers?.length) throw new Error('Missing answers/options');
    const optionKeys = new Set(q.options.map((o) => o.key));
    if (q.correctAnswers.some((a) => !optionKeys.has(a))) throw new Error('Correct answer missing from options');
  }
}

async function callGemini(level: Level): Promise<GenerationPayload> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const secret = await getSecretJson(process.env.GEMINI_API_KEY_SECRET_ID!);
  const apiKey = process.env.GEMINI_API_KEY || secret.apiKey;
  const prompt = `Return strict JSON only with key questions (array of 5). Create AWS ${level} exam-style scenario questions with realistic distractors, single or multiple correct answers, and concise explanations.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  const parsed = JSON.parse(text) as GenerationPayload;
  validateQuestions(parsed);
  return parsed;
}

export async function generateAndPersistBatch(): Promise<{ batchId: string; level: Level; count: number }> {
  const level = randomLevel();
  const payload = await callGemini(level);

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
    promptVersion: 'v1',
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

  return { batchId, level, count: payload.questions.length };
}
