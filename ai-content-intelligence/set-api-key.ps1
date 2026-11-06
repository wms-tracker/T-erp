# Writes ANTHROPIC_API_KEY into .env next to this script. The key is typed hidden and never printed.
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '.env'
$example = Join-Path $PSScriptRoot '.env.example'

Write-Host ''
Write-Host '=== ตั้งค่า ANTHROPIC_API_KEY ===' -ForegroundColor Cyan
Write-Host 'วาง API key (ขึ้นต้นด้วย sk-ant-) แล้วกด Enter  — ตัวอักษรจะไม่แสดงบนจอ'
Write-Host 'วางด้วยคลิกขวา หรือ Ctrl+V'
$secure = Read-Host 'API key' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if (-not $key.StartsWith('sk-ant-')) {
  Write-Host 'key ไม่ถูกต้อง: ต้องขึ้นต้นด้วย sk-ant-  (ไม่ได้บันทึก)' -ForegroundColor Red
  Read-Host 'กด Enter เพื่อปิด'; exit 1
}

if (Test-Path $envFile) { $lines = @(Get-Content $envFile -Encoding UTF8) }
elseif (Test-Path $example) { $lines = @(Get-Content $example -Encoding UTF8) }
else { $lines = @() }

$found = $false
$lines = $lines | ForEach-Object {
  if ($_ -match '^\s*ANTHROPIC_API_KEY\s*=') { $found = $true; "ANTHROPIC_API_KEY=$key" } else { $_ }
}
if (-not $found) { $lines = @($lines) + "ANTHROPIC_API_KEY=$key" }

[IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object Text.UTF8Encoding $false))

$saved = (Select-String -Path $envFile -Pattern '^ANTHROPIC_API_KEY=sk-ant-.+').Count -gt 0
if ($saved) {
  Write-Host ''
  Write-Host ("บันทึกแล้วที่ " + $envFile) -ForegroundColor Green
  Write-Host ('key: ' + $key.Substring(0, 10) + '...' + $key.Substring($key.Length - 4))
  Write-Host 'ขั้นต่อไป: ปิดเซิร์ฟเวอร์เดิม แล้วเปิดใหม่ (npm start) เพื่อให้ระบบอ่าน key'
} else {
  Write-Host 'บันทึกไม่สำเร็จ' -ForegroundColor Red
}
Read-Host 'กด Enter เพื่อปิด'
