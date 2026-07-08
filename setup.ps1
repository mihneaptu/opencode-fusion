#!/usr/bin/env pwsh
<#
.SYNOPSIS
  opencode-fusion setup: configures global opencode config for the two-agent fusion pattern.
.DESCRIPTION
  Asks which models you want for each agent role, writes the global opencode.json,
  copies agent prompts to ~/.config/opencode/agent/, and tells you which providers to connect.
.EXAMPLE
  ./setup.ps1          # interactive setup
  ./setup.ps1 -Force   # overwrite without backup prompt
#>

param([switch]$Force)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "  opencode-fusion setup" -ForegroundColor Cyan
Write-Host "  =======================" -ForegroundColor Cyan
Write-Host ""

# --- helpers ---

function Ask($label, $default) {
  $p = "  $label"
  if ($default) { $p += " [$default]" }
  $p += ": "
  $v = Read-Host $p
  if (-not $v) { $v = $default }
  return $v
}

# --- collect choices ---

Write-Host "  Choose models for each agent role." -ForegroundColor Yellow
Write-Host "  Press Enter to accept the [default]." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Common providers and models:" -ForegroundColor DarkGray
Write-Host "    opencode-go  - free: glm-5.2" -ForegroundColor DarkGray
Write-Host "    anthropic    - paid: claude-opus-4-8, claude-sonnet-5, claude-haiku-4-5" -ForegroundColor DarkGray
Write-Host "    openai       - paid: gpt-5.5, gpt-5.4-mini" -ForegroundColor DarkGray
Write-Host "    opencode     - Zen: deepseek-v4-flash-free (free), many others" -ForegroundColor DarkGray
Write-Host "    progrok      - Grok via local proxy, needs SuperGrok" -ForegroundColor DarkGray
Write-Host "    kiro         - Claude via local Kiro gateway, needs Kiro" -ForegroundColor DarkGray
Write-Host ""

$mainModel     = Ask "Main agent (planner/reviewer)" "opencode-go/glm-5.2"
$sidekickModel = Ask "Sidekick agent (executor)"     "progrok/grok-composer-2.5-fast"
$exploreModel  = Ask "Explore agent"                 $sidekickModel
$visionModel   = Ask "Vision agent (Enter to skip)"

# --- detect progrok ---

$needsProgrok = ($mainModel,$sidekickModel,$exploreModel,$visionModel | Where-Object { $_ -like "progrok/*" }).Count -gt 0
$proxyUrl = "http://127.0.0.1:18645/v1"
if ($needsProgrok) {
  Write-Host ""
  $proxyUrl = Ask "progrok proxy URL" $proxyUrl
}

$needsKiro = ($mainModel,$sidekickModel,$exploreModel,$visionModel | Where-Object { $_ -like "kiro/*" }).Count -gt 0
$kiroUrl = "http://127.0.0.1:9000/v1"
if ($needsKiro) {
  Write-Host ""
  $kiroUrl = Ask "Kiro gateway URL" $kiroUrl
}

# --- build config ---

$bashAllow = [ordered]@{
  "*"                 = "deny"
  "npm run lint*"     = "allow"
  "npm test*"         = "allow"
  "npm run build*"    = "allow"
  "npx tsc --noEmit*" = "allow"
  "npx vitest run*"   = "allow"
  "git diff*"         = "allow"
  "git status*"       = "allow"
  "git log*"          = "allow"
  "git show*"         = "allow"
  "git add*"          = "allow"
  "git commit*"       = "allow"
  "git push*"         = "allow"
  "node --version*"   = "allow"
  "npm --version*"    = "allow"
}

$config = [ordered]@{
  "`$schema" = "https://opencode.ai/config.json"
  model      = $mainModel
  provider   = [ordered]@{}
  agent      = [ordered]@{
    build     = [ordered]@{
      model      = $mainModel
      prompt     = "{file:agent/build.md}"
      permission = [ordered]@{ edit = "deny"; bash = $bashAllow; task = "allow" }
    }
    explore   = @{ model = $exploreModel }
    sidekick  = @{ model = $sidekickModel }
  }
}

if ($visionModel) {
  $config.agent.vision = @{ model = $visionModel }
}

if ($needsProgrok) {
  $models = [ordered]@{}
  if (($sidekickModel -like "progrok/grok-composer-*") -or ($exploreModel -like "progrok/grok-composer-*")) {
    $models["grok-composer-2.5-fast"] = @{ name = "Grok Composer 2.5 Fast" }
  }
  if ($visionModel -like "progrok/grok-4*") {
    $models["grok-4.3"] = [ordered]@{
      name       = "Grok 4.3"
      attachment = $true
      modalities = @{ input = @("text","image") }
      tool_call  = $true
      limit      = @{ context = 1000000; output = 16384 }
    }
  }
  $config.provider["progrok"] = [ordered]@{
    npm     = "@ai-sdk/openai-compatible"
    name    = "Grok (progrok)"
    options = [ordered]@{ baseURL = $proxyUrl; apiKey = "anything" }
    models  = $models
  }
}

if ($needsKiro) {
  $kiroModels = [ordered]@{}
  if (($mainModel,$sidekickModel,$exploreModel,$visionModel) -like "kiro/claude-opus-4-8") {
    $kiroModels["claude-opus-4-8"] = [ordered]@{
      name       = "Opus 4.8"
      attachment = $true
      modalities = @{ input = @("text","image") }
    }
  }
  if (($mainModel,$sidekickModel,$exploreModel,$visionModel) -like "kiro/claude-sonnet-5") {
    $kiroModels["claude-sonnet-5"] = @{ name = "Sonnet 5" }
  }
  $config.provider["kiro"] = [ordered]@{
    npm     = "@ai-sdk/openai-compatible"
    name    = "Kiro Gateway (Claude)"
    options = [ordered]@{ baseURL = $kiroUrl; apiKey = "kiro-local-proxy-key" }
    models  = $kiroModels
  }
}

# --- write config ---

$cfgDir  = Join-Path $env:USERPROFILE ".config\opencode"
$cfgPath = Join-Path $cfgDir "opencode.json"

if ((Test-Path $cfgPath) -and -not $Force) {
  $bak = "$cfgPath.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Copy-Item $cfgPath $bak -Force
  Write-Host "  Backed up existing config to: $bak" -ForegroundColor Yellow
}

if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Path $cfgDir -Force | Out-Null }
$config | ConvertTo-Json -Depth 10 | Set-Content -Path $cfgPath -Encoding UTF8
Write-Host "  Config written:  $cfgPath" -ForegroundColor Green

# --- copy agents ---

$agentDir = Join-Path $cfgDir "agent"
if (-not (Test-Path $agentDir)) { New-Item -ItemType Directory -Path $agentDir -Force | Out-Null }

foreach ($f in @("build.md","sidekick.md","vision.md")) {
  $src = Join-Path $root "agents\$f"
  if (Test-Path $src) { Copy-Item $src (Join-Path $agentDir $f) -Force }
}
Write-Host "  Agents copied:   $agentDir" -ForegroundColor Green

# --- copy agents to project (for project-level opencode.json) ---
$projectAgentDir = Join-Path $root "agent"
if (-not (Test-Path $projectAgentDir)) { New-Item -ItemType Directory -Path $projectAgentDir -Force | Out-Null }
foreach ($f in @("build.md","sidekick.md","vision.md")) {
  $src = Join-Path $root "agents\$f"
  if (Test-Path $src) { Copy-Item $src (Join-Path $projectAgentDir $f) -Force }
}
Write-Host "  Project agents:  $projectAgentDir" -ForegroundColor Green

# --- next steps ---

Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Restart opencode"

$connect = @()
foreach ($m in @($mainModel,$sidekickModel,$exploreModel,$visionModel)) {
  if ($m -like "anthropic/*") { $connect += "anthropic" }
}
$connect = $connect | Sort-Object -Unique
if ($connect) {
  Write-Host "    2. Run /connect and connect: $($connect -join ', ')"
}
if ($needsProgrok) {
  Write-Host "    3. Make sure progrok proxy is running at $proxyUrl"
}
if ($needsKiro) {
  Write-Host "    4. Make sure the Kiro gateway is running at $kiroUrl"
}
Write-Host ""
Write-Host "  Change models later: edit $cfgPath" -ForegroundColor DarkGray
Write-Host ""