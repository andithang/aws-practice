param(
  [string]$ApiBase = "http://127.0.0.1:3002",
  [string]$AdminToken = "",
  [switch]$RunMutations
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  throw "Provide -AdminToken <token> to test admin APIs."
}

function ConvertTo-Base64Url {
  param([byte[]]$Bytes)

  return [Convert]::ToBase64String($Bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function ConvertFrom-Base64Url {
  param([string]$Value)

  $normalized = $Value.Replace('-', '+').Replace('_', '/')
  switch ($normalized.Length % 4) {
    2 { $normalized += '==' }
    3 { $normalized += '=' }
    0 { }
    default { throw "Invalid base64url value." }
  }

  return [Convert]::FromBase64String($normalized)
}

function Get-DeviceIdFromSeed {
  param([string]$Seed)

  $seedBytes = ConvertFrom-Base64Url $Seed
  if ($seedBytes.Length -lt 64) {
    throw "Seed is too short."
  }

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ConvertTo-Base64Url ($sha.ComputeHash($seedBytes))
  } finally {
    $sha.Dispose()
  }
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

  try {
    $response = Invoke-WebRequest @params
  } catch {
    if ($_.Exception.Response) {
      $response = $_.Exception.Response
    } else {
      throw
    }
  }

  $content = $response.Content
  if ($response -is [System.Net.HttpWebResponse]) {
    $content = (New-Object IO.StreamReader($response.GetResponseStream())).ReadToEnd()
  }

  $body = $null
  if (-not [string]::IsNullOrWhiteSpace($content)) {
    $body = $content | ConvertFrom-Json
  }

  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Body = $body
  }
}

Write-Host "1) GET /api/practice/questions without device"
$probe = Invoke-Json -Method GET -Uri "$ApiBase/api/practice/questions?level=practitioner&page=1&size=10&window=0"
if ($probe.StatusCode -ne 428) {
  throw "Expected device validation failure for missing header."
}
Write-Host "   status=$($probe.StatusCode)"

Write-Host "2) POST /api/device/seed"
$seedResponse = Invoke-Json -Method POST -Uri "$ApiBase/api/device/seed"
if ($seedResponse.StatusCode -ne 200 -or [string]::IsNullOrWhiteSpace($seedResponse.Body.seed)) {
  throw "Device seed bootstrap failed."
}

$deviceId = Get-DeviceIdFromSeed $seedResponse.Body.seed
$deviceHeaders = @{ 'X-Device-Id' = $deviceId }

Write-Host "3) GET /api/practice/questions with device"
$practice = Invoke-Json -Method GET -Uri "$ApiBase/api/practice/questions?level=practitioner&page=1&size=10&window=0" -Headers $deviceHeaders
if ($practice.StatusCode -ne 200) {
  throw "Practice request failed after bootstrap."
}
Write-Host "   questions=$($practice.Body.questions.Count), expiresAt=$($seedResponse.Body.expiresAt)"

Write-Host "4) POST /api/admin/login with device"
$login = Invoke-Json -Method POST -Uri "$ApiBase/api/admin/login" -Headers $deviceHeaders -Body @{ token = $AdminToken }
if ($login.StatusCode -ne 200 -or -not $login.Body.ok) {
  throw "Admin login failed."
}
Write-Host "   login=ok"

$authHeaders = @{ Authorization = "Bearer $AdminToken"; 'X-Device-Id' = $deviceId }

Write-Host "5) GET /api/admin/batches"
$batchesResponse = Invoke-Json -Method GET -Uri "$ApiBase/api/admin/batches" -Headers $authHeaders
$count = if ($null -eq $batchesResponse.batches) { 0 } else { $batchesResponse.batches.Count }
Write-Host "   batches=$count"

if ($RunMutations) {
  Write-Host "6) POST /api/admin/generate"
  $generate = Invoke-Json -Method POST -Uri "$ApiBase/api/admin/generate" -Headers $authHeaders
  Write-Host "   generated batchId=$($generate.Body.batchId), level=$($generate.Body.level), count=$($generate.Body.count)"
}

Write-Host "Smoke test completed."
