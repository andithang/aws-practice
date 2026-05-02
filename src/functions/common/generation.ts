import crypto from 'node:crypto';
import { getParameterValue, putItem } from './aws';
import { errorLogFields, logInfo, logWarn } from './log';
import { ExamQuestion, GenerationPayload, Level } from './types';

const levels: Level[] = ['practitioner', 'associate', 'professional'];
const expectedQuestionCount = 5;
const maxGenerationAttempts = 10;
const expectedPayloadKeys = ['questions'];
const expectedQuestionKeys = [
  'questionId',
  'topic',
  'examStyle',
  'stem',
  'options',
  'correctAnswers',
  'explanation',
  'difficultyScore'
];
const expectedOptionKeys = ['A', 'B', 'C', 'D'];
const expectedOptionObjectKeys = ['key', 'text'];

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

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length && expectedKeys.every((key) => key in value);
}

function assertExactKeys(value: Record<string, unknown>, expectedKeys: string[], context: string): void {
  if (!hasExactKeys(value, expectedKeys)) {
    throw new Error(`${context} must contain exactly ${expectedKeys.join(', ')}`);
  }
}

function levelScopeLines(level: Level): string[] {
  if (level === 'practitioner') {
    return [
      'Level-specific scope:',
      '1. For practitioner, target general AWS cloud fundamentals and CLF-style breadth.',
      '2. Emphasize cloud value proposition, shared responsibility, AWS global infrastructure, basic security and compliance, billing, pricing, and support.',
      '3. Test when to choose common managed services, support plans, cost tools, deployment models, resiliency basics, and operational responsibility boundaries.',
      '4. Keep questions accessible, but avoid pure vocabulary recall. Use short business scenarios and service-selection trade-offs.'
    ];
  }

  if (level === 'associate') {
    return [
      'Level-specific scope:',
      '1. For associate, target Solutions Architect Associate style coverage.',
      '2. Emphasize secure, resilient, high-performing, and cost-optimized distributed systems on AWS.',
      '3. Test architecture choices for VPC design, compute placement, storage durability, database scaling, decoupling, identity, encryption, monitoring, and migration.',
      '4. Prefer scenario questions where several services could work, but only one answer best satisfies the stated constraints.'
    ];
  }

  return [
    'Level-specific scope:',
    '1. For professional, target Solutions Architect Professional style coverage.',
    '2. Emphasize multi-account governance, hybrid networking, migrations and modernization, disaster recovery, cost control, organizational complexity, and continuous improvement.',
    '3. Test cross-account and cross-Region designs, centralized security controls, landing zones, hybrid DNS/connectivity, large-scale data movement, advanced resiliency, and operational evolution.',
    '4. Prefer complex scenarios with competing requirements and distractors that are plausible but weaker because of operational overhead, blast radius, cost, latency, governance, or migration risk.'
  ];
}

export function buildGenerationPrompt(level: Level): string {
  return [
    'Task: Generate high-quality AWS certification practice questions that resemble real AWS exam questions in style, breadth, and decision-making depth.',
    `Target level: ${level}.`,
    `Output exactly ${expectedQuestionCount} questions.`,
    'Return only valid JSON. Do not return markdown, code fences, or extra text.',
    '',
    'You are writing questions for professional AWS certification prep, not beginner quizzes.',
    'Questions must test architecture judgment, service selection, operational trade-offs, security, resilience, performance, and cost optimization.',
    'Avoid producing mostly basic questions about only S3, EC2, Lambda, and IAM.',
    '',
    ...levelScopeLines(level),
    '',
    'Coverage requirements:',
    '1. Spread questions across a broad set of AWS domains such as compute, storage, databases, networking, security, identity, observability, migration, analytics, messaging, containers, serverless, governance, and cost optimization.',
    '2. Use a diverse set of AWS services across the full question set. Prefer broad coverage over repeating the same services.',
    '3. Limit overuse of common services. Do not let S3, EC2, Lambda, or IAM dominate the set unless explicitly required by the target level.',
    '4. Include realistic combinations of services, for example:',
    '   - VPC, Transit Gateway, Direct Connect, Site-to-Site VPN, Client VPN, Route 53, CloudFront, Global Accelerator, PrivateLink, Network Firewall',
    '   - ALB, NLB, Auto Scaling, EC2 placement groups, Spot, Savings Plans, Elastic Beanstalk, App Runner, Batch, Outposts, Wavelength',
    '   - RDS, Aurora, Aurora Serverless, DynamoDB, ElastiCache, Redshift, DocumentDB, Neptune, Keyspaces, Timestream',
    '   - ECS, EKS, Fargate, ECR, Lambda, API Gateway, AppSync, Step Functions, EventBridge, SQS, SNS, MQ',
    '   - KMS, CloudHSM, Secrets Manager, ACM, Cognito, IAM Identity Center, Organizations, SCPs, RAM, Config, CloudTrail, GuardDuty, Security Hub, Inspector, Macie, Detective, Shield, WAF',
    '   - DMS, SCT, Application Migration Service, DataSync, Transfer Family, Storage Gateway, Snow Family, FSx, EFS, EBS, S3 Glacier, Backup, Elastic Disaster Recovery',
    '   - CloudWatch metrics/logs/alarms, X-Ray, Systems Manager, CloudFormation, CDK, Control Tower, Service Catalog, Trusted Advisor, Compute Optimizer, Well-Architected Tool',
    '   - Glue, Lake Formation, Athena, EMR, Kinesis Data Streams, Data Firehose, MSK, OpenSearch, QuickSight, Redshift',
    '',
    'Feature-depth requirements:',
    '1. Ask about service features and design limits, not only service names.',
    '2. Include trade-offs such as DynamoDB global tables vs DAX, on-demand vs provisioned capacity, streams, TTL, conditional writes, and partition key design.',
    '3. Include storage trade-offs such as S3 lifecycle, replication, and Object Lock; EBS volume types and snapshots; EFS performance modes; FSx for Windows, Lustre, NetApp ONTAP, and OpenZFS; Storage Gateway file/volume/tape gateways.',
    '4. Include database trade-offs such as RDS Multi-AZ vs read replicas, Aurora global database, Aurora Serverless, backup/restore, failover, proxying, caching, and schema migration.',
    '5. Include networking trade-offs such as Transit Gateway vs VPC peering, PrivateLink vs NAT Gateway vs internet gateway, Direct Connect vs VPN, Route 53 routing policies, hybrid DNS, VPC endpoints, load balancer types, and Global Accelerator vs CloudFront.',
    '6. Include edge and security patterns such as CloudFront, AWS WAF, and origin patterns; Shield Advanced; ACM; field-level encryption; signed URLs/cookies; origin access control.',
    '7. Include integration trade-offs such as Step Functions Standard vs Express, SQS FIFO, dead-letter queues, and visibility timeout, SNS fanout, EventBridge buses/rules/pipes/scheduler, and Amazon MQ for protocol compatibility.',
    '8. Include security and identity trade-offs such as KMS key choices, grants, rotation, envelope encryption, Secrets Manager rotation, IAM roles and permission boundaries, SCPs, IAM Identity Center, Cognito user pools vs identity pools, CloudHSM, and cross-account access.',
    '9. Include governance and operations trade-offs such as Control Tower guardrails, Organizations, AWS Config rules/conformance packs, CloudTrail organization trails, Security Hub aggregation, Systems Manager patching/session/run command, and observability with CloudWatch and X-Ray.',
    '10. Include migration, analytics, and cost trade-offs such as DMS full load vs CDC, SCT, Application Migration Service, DataSync vs Transfer Family vs Snow Family, Glue crawlers/jobs, Lake Formation permissions, Athena vs Redshift vs EMR, Kinesis vs MSK, Savings Plans vs Reserved Instances, Cost Explorer, Budgets, CUR, and Compute Optimizer.',
    '',
    'Exam-style requirements:',
    '1. Write scenario-based stems similar to real AWS certification exams.',
    '2. Many questions should involve choosing the BEST solution among plausible alternatives, not simple definition recall.',
    '3. Use distractors that are technically possible but suboptimal because of cost, scalability, operational overhead, latency, durability, security, or AWS best practices.',
    '4. Prefer questions about trade-offs, constraints, and requirements such as:',
    '   - lowest operational overhead',
    '   - highest availability',
    '   - lowest latency',
    '   - least expensive',
    '   - most secure',
    '   - minimal code changes',
    '   - hybrid connectivity',
    '   - multi-account governance',
    '   - disaster recovery',
    '   - data residency and encryption',
    '   - compliance evidence and auditability',
    '   - quota-aware scaling',
    '   - RTO/RPO requirements',
    '5. Avoid trivia-only questions and avoid obviously wrong distractors.',
    '6. Distractors should usually be valid AWS architectures that fail one or more stated constraints.',
    '',
    'Difficulty and realism requirements:',
    '1. Mix moderate and difficult questions unless the target level clearly indicates beginner.',
    '2. Use realistic AWS terminology, service capabilities, and architectural trade-offs.',
    '3. Do not invent nonexistent AWS features.',
    '4. Keep explanations concise but explicitly state why the correct answer is best and why the other options are less suitable.',
    '5. For practitioner, prefer difficultyScore 2-5. For associate, prefer 4-7. For professional, prefer 6-9.',
    '',
    'Diversity rules across the full set:',
    `1. questions must be an array of exactly ${expectedQuestionCount} objects.`,
    '2. questionId must be non-empty and unique across all questions.',
    '3. Each question must include all schema fields with non-empty strings where applicable.',
    '4. options must be an array of exactly 4 objects with unique keys A, B, C, D.',
    '5. correctAnswers must contain one or more option keys and every key must exist in options.',
    '6. difficultyScore must be a finite number from 1 to 10.',
    '7. At least 70% of questions should involve services beyond only S3, EC2, Lambda, and IAM.',
    '8. Avoid repeating the same primary service combination in multiple questions unless necessary.',
    '9. Include both single-select and multi-select questions when appropriate for the target level.',
    '10. Across the 5 questions, cover at least 4 distinct domains and at least 8 distinct AWS services.',
    '11. At least 3 questions must test a feature-level trade-off within a service, not only a service-to-service comparison.',
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
    '      "explanation": "why correct and why others are less suitable",',
    '      "difficultyScore": 1',
    '    }',
    '  ]',
    '}',
    '',
    'Generation process to follow internally before answering:',
    '1. First plan a balanced distribution of topics and AWS services for the full set.',
    '2. Then generate the questions so the set is diverse and exam-like.',
    '3. Then verify no service or topic is overrepresented.',
    '4. Then verify the JSON parses and strictly matches the schema.',
    '',
    'Final check before responding: ensure the JSON parses correctly and strictly matches the schema and all constraints.'
  ].join('\n');
}

export function validateQuestions(payload: unknown): asserts payload is GenerationPayload {
  const payloadObject = asRecord(payload, 'payload');
  if (!hasExactKeys(payloadObject, expectedPayloadKeys)) {
    throw new Error('payload must contain only questions');
  }

  const questions = payloadObject.questions;

  if (!Array.isArray(questions) || questions.length !== expectedQuestionCount) {
    throw new Error(`payload.questions must contain exactly ${expectedQuestionCount} items`);
  }

  const ids = new Set<string>();
  for (const [questionIndex, rawQuestion] of questions.entries()) {
    const question = asRecord(rawQuestion, `questions[${questionIndex}]`);
    assertExactKeys(question, expectedQuestionKeys, `questions[${questionIndex}]`);

    const questionId = asNonEmptyString(question.questionId, `questions[${questionIndex}].questionId`);

    if (ids.has(questionId)) {
      throw new Error(`Duplicate questionId detected: ${questionId}`);
    }

    ids.add(questionId);

    asNonEmptyString(question.topic, `questions[${questionIndex}].topic`);
    const examStyle = asNonEmptyString(question.examStyle, `questions[${questionIndex}].examStyle`);
    if (examStyle !== 'single-select' && examStyle !== 'multi-select') {
      throw new Error(`questions[${questionIndex}].examStyle must be single-select or multi-select`);
    }

    asNonEmptyString(question.stem, `questions[${questionIndex}].stem`);
    asNonEmptyString(question.explanation, `questions[${questionIndex}].explanation`);

    if (
      typeof question.difficultyScore !== 'number' ||
      !Number.isFinite(question.difficultyScore) ||
      question.difficultyScore < 1 ||
      question.difficultyScore > 10
    ) {
      throw new Error(`questions[${questionIndex}].difficultyScore must be a finite number from 1 to 10`);
    }

    if (!Array.isArray(question.options) || question.options.length !== expectedOptionKeys.length) {
      throw new Error(`questions[${questionIndex}].options must contain exactly 4 items`);
    }

    const optionKeys = new Set<string>();
    for (const [optionIndex, rawOption] of question.options.entries()) {
      const option = asRecord(rawOption, `questions[${questionIndex}].options[${optionIndex}]`);
      assertExactKeys(
        option,
        expectedOptionObjectKeys,
        `questions[${questionIndex}].options[${optionIndex}]`
      );

      const optionKey = asNonEmptyString(
        option.key,
        `questions[${questionIndex}].options[${optionIndex}].key`
      );
      asNonEmptyString(option.text, `questions[${questionIndex}].options[${optionIndex}].text`);
      optionKeys.add(optionKey);
    }

    if (
      optionKeys.size !== expectedOptionKeys.length ||
      expectedOptionKeys.some((expectedKey) => !optionKeys.has(expectedKey))
    ) {
      throw new Error(`questions[${questionIndex}].options must contain keys A, B, C, D`);
    }

    const correctAnswers = asStringArray(
      question.correctAnswers,
      `questions[${questionIndex}].correctAnswers`
    );
    if (new Set(correctAnswers).size !== correctAnswers.length) {
      throw new Error(`questions[${questionIndex}].correctAnswers must contain unique keys`);
    }

    if (correctAnswers.some((answer) => !optionKeys.has(answer))) {
      throw new Error(`questions[${questionIndex}].correctAnswers contains keys missing from options`);
    }

    if (examStyle === 'single-select' && correctAnswers.length !== 1) {
      throw new Error(`questions[${questionIndex}].single-select questions require exactly 1 correct answer`);
    }

    if (examStyle === 'multi-select' && (correctAnswers.length < 2 || correctAnswers.length > 3)) {
      throw new Error(`questions[${questionIndex}].multi-select questions require 2 or 3 correct answers`);
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
  const parameterApiKey = await getParameterValue(process.env.GEMINI_API_KEY_PARAMETER_NAME!);
  const apiKey = process.env.GEMINI_API_KEY || parameterApiKey;
  const prompt = buildGenerationPrompt(level);

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
    promptVersion: 'v3',
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
