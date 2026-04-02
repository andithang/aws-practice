"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomLevel = randomLevel;
exports.generateAndPersistBatch = generateAndPersistBatch;
const node_crypto_1 = __importDefault(require("node:crypto"));
const aws_1 = require("./aws");
const levels = ['practitioner', 'associate', 'professional'];
function randomLevel() {
    return levels[Math.floor(Math.random() * levels.length)];
}
function validateQuestions(payload) {
    const ids = new Set();
    for (const q of payload.questions) {
        if (!q.questionId || ids.has(q.questionId))
            throw new Error('Duplicate or missing questionId');
        ids.add(q.questionId);
        if (!q.options?.length || !q.correctAnswers?.length)
            throw new Error('Missing answers/options');
        const optionKeys = new Set(q.options.map((o) => o.key));
        if (q.correctAnswers.some((a) => !optionKeys.has(a)))
            throw new Error('Correct answer missing from options');
    }
}
async function callGemini(level) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const secret = await (0, aws_1.getSecretJson)(process.env.GEMINI_API_KEY_SECRET_ID);
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
    if (!text)
        throw new Error('Gemini returned empty response');
    const parsed = JSON.parse(text);
    validateQuestions(parsed);
    return parsed;
}
async function generateAndPersistBatch() {
    const level = randomLevel();
    const payload = await callGemini(level);
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const batchId = node_crypto_1.default.randomUUID();
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const pk = `LEVEL#${level}`;
    const batchSk = `DATE#${date}#BATCH#${batchId}`;
    await (0, aws_1.putItem)({
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
    await Promise.all(payload.questions.map((q, idx) => {
        const sk = `DATE#${date}#Q#${String(idx + 1).padStart(3, '0')}#BATCH#${batchId}`;
        return (0, aws_1.putItem)({
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
