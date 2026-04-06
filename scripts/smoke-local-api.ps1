param(
  [string]$ApiBase = "http://127.0.0.1:3002",
  [string]$AdminToken = "",
  [switch]$RunMutations
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  throw "Provide -AdminToken <token> to test admin APIs."
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $params = @{
    Method  = $Method
    Uri     = $Uri
    Headers = $Headers
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 8)
  }

  return Invoke-RestMethod @params
}

Write-Host "1) GET /api/practice/questions"
$practice = Invoke-Json -Method GET -Uri "$ApiBase/api/practice/questions"
Write-Host "   level=$($practice.level), questions=$($practice.questions.Count)"

Write-Host "2) POST /api/admin/login"
$login = Invoke-Json -Method POST -Uri "$ApiBase/api/admin/login" -Body @{ token = $AdminToken }
if (-not $login.ok) {
  throw "Admin login failed."
}
Write-Host "   login=ok"

$authHeaders = @{ Authorization = "Bearer $AdminToken" }

Write-Host "3) GET /api/admin/batches"
$batchesResponse = Invoke-Json -Method GET -Uri "$ApiBase/api/admin/batches" -Headers $authHeaders
$count = if ($null -eq $batchesResponse.batches) { 0 } else { $batchesResponse.batches.Count }
Write-Host "   batches=$count"

if ($RunMutations) {
  Write-Host "4) POST /api/admin/generate"
  $generate = Invoke-Json -Method POST -Uri "$ApiBase/api/admin/generate" -Headers $authHeaders
  Write-Host "   generated batchId=$($generate.batchId), level=$($generate.level), count=$($generate.count)"
}

Write-Host "Smoke test completed."
