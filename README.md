# AWS Exam Practice (SAM + Next.js Static Frontend)

Minimal production-ready serverless system for generating and serving AWS exam-style questions.

## Architecture

- **Scheduled generation (every 8 hours)**: EventBridge Scheduler -> `DailyGeneratorFunction` Lambda -> Gemini 2.5 Flash -> DynamoDB single-table write.
- **Public practice API**: `GET /api/practice/questions` where Lambda randomly picks level and returns random published questions.
- **Learner auth**: Amazon Cognito User Pool (email/password sign-up + email verification + required `name` attribute).
- **Admin API**: Bearer token validation in Lambda (token in SSM Parameter Store).
- **Device bootstrap**: `POST /api/device/seed` issues a browser-scoped seed used to derive the `X-Device-Id` header required by every HTTP API route.
- **Practice answer persistence**: Learner answer selections are saved in a dedicated DynamoDB table and rehydrated on next visit.
- **Frontend**: Next.js static export hosted on GitHub Pages.
- **Admin browser flow**: Frontend calls `/api/admin/login`, `/api/admin/batches`, `/api/admin/generate`, `/api/admin/batches/{batchId}/publish`, `/api/admin/batches/{batchId}/deprecate`, `/api/admin/questions`, `/api/admin/questions/status`, `/api/admin/devices`, and `/api/admin/devices/{deviceId}` directly, with the shared device header attached automatically.

## Core constraints implemented

- No generation at request time.
- FE level selection is done by learner on `/levels`.
- Learner APIs require both Cognito JWT (`Authorization`) and device header (`X-Device-Id`).
- Public practice FE calls `/api/practice/questions` plus `/api/practice/answers` for persistence.

## DynamoDB tables

Question table: `aws_exam_questions`

- Batch item:
  - `PK = LEVEL#{level}`
  - `SK = DATE#{yyyy-mm-dd}#BATCH#{batchId}`
- Question item:
  - `PK = LEVEL#{level}`
  - `SK = DATE#{yyyy-mm-dd}#Q#{questionNumber}#BATCH#{batchId}`

Device table: `aws_exam_devices`

- Device item:
  - `PK = DEVICE#{deviceId}`
  - `SK = METADATA`
  - TTL attribute: `ttl`

Practice answers table: `aws_exam_practice_answers`

- Answer item:
  - `PK = USER#{cognitoSub}`
  - `SK = QUESTION#{questionKey}`

## Deploy

```bash
sam build
sam deploy --guided
```

Frontend deploy is handled by GitHub Actions to GitHub Pages (`frontend/out`).
Frontend API calls are direct to `NEXT_PUBLIC_API_BASE_URL` (AWS API Gateway). There is no Next.js backend proxy/fallback.

## Run APIs locally

Local API runs in SAM Docker, but still calls your real AWS resources (DynamoDB + SSM Parameter Store), so valid AWS credentials are required.

### 1) Prepare local config

1. Copy `env.local.json.example` to `env.local.json` (already created in this repo).
2. Update values in `env.local.json` if your table/secret IDs differ (`TABLE_NAME` and `DEVICE_TABLE_NAME`).
3. Ensure AWS credentials are available locally (`aws configure` or `AWS_PROFILE`).

### 2) Start local API

```powershell
.\scripts\start-local-api.ps1
```

Default URL: `http://127.0.0.1:3002`

### 3) Smoke-test endpoints

```powershell
.\scripts\smoke-local-api.ps1 -AdminToken "<your-admin-token>"
```

Optional (will generate new question batches):

```powershell
.\scripts\smoke-local-api.ps1 -AdminToken "<your-admin-token>" -RunMutations
```

The smoke script now validates the device bootstrap flow first, then retries practice and admin requests with `X-Device-Id`.

### 4) Point frontend to local API

```powershell
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:3002"
cd frontend
npm run dev
```

## Required environment/secrets

- `GEMINI_MODEL` (default `gemini-2.5-flash`)
- `GEMINI_API_KEY_PARAMETER_NAME` -> SSM parameter string (raw API key)
- `ADMIN_TOKEN_PARAMETER_NAME` -> SSM parameter string (raw admin token)
- `TABLE_NAME` (questions table, default `aws_exam_questions`)
- `DEVICE_TABLE_NAME` (device table, default `aws_exam_devices`)
- `PRACTICE_ANSWERS_TABLE_NAME` (practice answers table, default `aws_exam_practice_answers`)
- Frontend build env:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `NEXT_PUBLIC_COGNITO_REGION`
  - `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
  - `NEXT_PUBLIC_COGNITO_CLIENT_ID`

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
