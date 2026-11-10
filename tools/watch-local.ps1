# 공식 글 감시(이 PC에서 실행)
# 넥슨 공식 사이트가 해외 접속(GitHub Actions)에는 한국어 목록 대신 다른 화면을 주므로(2026-11-10 확인) 한국에 있는 PC에서 돌린다.
# 작업 폴더와 섞이지 않게 별도 복제본(%LOCALAPPDATA%\mbng-watch\MBNG-Advisor)에서 실행하고, 바뀐 것이 있으면 커밋·푸시한다(푸시 = Pages 배포).
# 재확인이 필요한 글을 찾으면 GitHub 이슈를 만든다. 기록은 %LOCALAPPDATA%\mbng-watch\watch.log
$ErrorActionPreference = "Continue"
$base = Join-Path $env:LOCALAPPDATA "mbng-watch"
$dir = Join-Path $base "MBNG-Advisor"
$log = Join-Path $base "watch.log"
$sum = Join-Path $base "summary.md"
New-Item -ItemType Directory -Force $base | Out-Null
function W($m) { $s = "$m".Trim(); if ($s -and $s -notmatch "RemoteException") { Add-Content -Path $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $s) -Encoding UTF8 } }
$src = Split-Path -Parent $PSScriptRoot
try {
  if (-not (Test-Path (Join-Path $dir ".git"))) { git -c core.autocrlf=false clone --quiet https://github.com/WonJeong-Dev/MBNG-Advisor.git $dir 2>&1 | ForEach-Object { W $_ } }
  Set-Location $dir
  # 저장소에 있는 그대로(줄바꿈 변환 없이) 받고, 커밋 작성자는 작업 폴더 설정을 따른다
  git config core.autocrlf false
  git config user.name (git -C $src config user.name)
  git config user.email (git -C $src config user.email)
  # 이 복제본은 감시 전용이라 매번 원격 최신 상태로 맞춘다
  git fetch --quiet origin 2>&1 | ForEach-Object { W $_ }
  git reset --hard --quiet origin/main 2>&1 | ForEach-Object { W $_ }
  if (Test-Path $sum) { Remove-Item $sum }
  node tools/watch-official.mjs --summary $sum 2>&1 | ForEach-Object { W $_ }
  node tools/build.mjs 2>&1 | ForEach-Object { W $_ }
  if (git status --porcelain data api "MBNG Advisor.html") {
    git add data api "MBNG Advisor.html"
    git commit --quiet -m "공식 글 감시 결과 반영" 2>&1 | ForEach-Object { W $_ }
    git push --quiet 2>&1 | ForEach-Object { W $_ }
    if (Test-Path $sum) { gh issue create -R WonJeong-Dev/MBNG-Advisor --title ("공식 글 감시: 재확인 필요 (" + (Get-Date -Format "yyyy-MM-dd") + ")") --body-file $sum 2>&1 | ForEach-Object { W $_ } }
  }
} catch { W ("오류: " + $_) }
# 기록은 최근 2000줄만 남긴다
$L = Get-Content $log -Encoding UTF8; if ($L.Count -gt 2000) { $L | Select-Object -Last 2000 | Set-Content $log -Encoding UTF8 }
