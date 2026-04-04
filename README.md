# AWS Exam Practice (SAM + Next.js Static Frontend)

Minimal production-ready serverless system for generating and serving AWS exam-style questions.

## Architecture

- **Daily generation**: EventBridge Scheduler -> `DailyGeneratorFunction` Lambda -> Gemini 2.5 Flash -> DynamoDB single-table write.
- **Public practice API**: `GET /api/practice/questions` where Lambda randomly picks level and returns random published questions.
- **Admin API**: API Gateway API key + Bearer token validation (token in Secrets Manager).
- **Frontend**: Next.js static export hosted on GitHub Pages.
- **Admin browser flow**: Frontend calls Lambda proxy endpoints (`/api/admin/login-proxy`, `/api/admin/command`) so `x-api-key` stays server-side.

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

Frontend deploy is handled by GitHub Actions to GitHub Pages (`frontend/out`).

## Required environment/secrets

- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `GEMINI_API_KEY_SECRET_ID` -> Secrets Manager JSON `{ "apiKey": "..." }`
- `ADMIN_TOKEN_SECRET_ID` -> Secrets Manager JSON `{ "token": "..." }`
- Admin proxy Lambda env:
  - `BACKEND_API_BASE_URL`
  - `ADMIN_API_KEY`
- Frontend build env:
  - `NEXT_PUBLIC_API_BASE_URL`

## GitHub Actions

Workflow in `.github/workflows/deploy.yml` deploys on pushes to `main`:
- Backend: SAM build/deploy for Lambda + API Gateway.
- Frontend: Next static build and GitHub Pages publish.

### Required GitHub Repository Secrets

Use `.env.example` at the repository root as the source of truth for required secret names and sample values.

The deploy workflow now:
- uses only GitHub repository secrets for all environment variables
- deploys frontend static files to GitHub Pages
- does not configure API Gateway custom domains

For GitHub Pages custom domain (`aws-practice.andithang.org`), configure the Pages site domain in repository settings and ensure your published Pages source contains `CNAME` with that value.
This repo includes a root `CNAME` file set to `aws-practice.andithang.org`.
