# AWS Exam Practice (SAM + Next.js SSR)

Minimal production-ready serverless system for generating and serving AWS exam-style questions.

## Architecture

- **Daily generation**: EventBridge Scheduler -> `DailyGeneratorFunction` Lambda -> Gemini 2.5 Flash -> DynamoDB single-table write.
- **Public practice API**: `GET /api/practice/questions` where Lambda randomly picks level and returns random published questions.
- **Admin API**: API Gateway API key + Bearer token validation (token in Secrets Manager).
- **Frontend**: Next.js SSR on Lambda + API Gateway (no OpenNext).

## Core constraints implemented

- No generation at request time.
- FE never chooses generation level.
- Public practice FE only calls `/api/practice/questions`.
- Random level selection occurs in Lambda for both generation and practice retrieval.

## DynamoDB single-table

Table name: `aws_exam_questions`

- Batch item:
  - `PK = LEVEL#{level}`
  - `SK = DATE#{yyyy-mm-dd}#BATCH#{batchId}`
- Question item:
  - `PK = LEVEL#{level}`
  - `SK = DATE#{yyyy-mm-dd}#Q#{questionNumber}#BATCH#{batchId}`

## Deploy

```bash
sam build
sam deploy --guided
```

## Required environment/secrets

- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `GEMINI_API_KEY_SECRET_ID` -> Secrets Manager JSON `{ "apiKey": "..." }`
- `ADMIN_TOKEN_SECRET_ID` -> Secrets Manager JSON `{ "token": "..." }`
- Frontend function env:
  - `BACKEND_API_BASE_URL`
  - `ADMIN_API_KEY`

## GitHub Actions

Workflow in `.github/workflows/deploy.yml` builds and deploys on pushes to `main`.
