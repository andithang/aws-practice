param(
  [int]$Port = 3001,
  [string]$Region = "ap-southeast-1"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "env.local.json")) {
  throw "env.local.json not found. Copy env.local.json.example to env.local.json and update values."
}

Write-Host "Setting AWS_REGION=$Region"
$env:AWS_REGION = $Region

Write-Host "Building SAM application..."
sam build

Write-Host "Starting local API on http://127.0.0.1:$Port ..."
sam local start-api --env-vars env.local.json --port $Port
