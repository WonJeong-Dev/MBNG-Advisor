# 공식 글 감시(이 PC에서 실행)
# 넥슨 공식 사이트가 해외 접속(GitHub Actions)에는 한국어 목록 대신 다른 화면을 주므로(2026-11-10 확인) 한국에 있는 PC에서 돌린다.
# 작업 폴더와 섞이지 않게 별도 복제본(%USERPROFILE%\mbng-watch\MBNG-Advisor)에서 실행하고, 바뀐 것이 있으면 커밋·푸시한다(푸시 = Pages 배포).
# 재확인이 필요한 글을 찾으면 요약을 %USERPROFILE%\mbng-watch\재확인-날짜.md로 남기고 이 PC에 Windows 알림을 띄운다(저장소 이슈 기능은 꺼져 있다).
# 기록은 %USERPROFILE%\mbng-watch\watch.log
# 작업 스케줄러 'MBNG Advisor 공식 글 감시'가 1시간마다 창 없이(conhost --headless) 실행한다(2026-11-10 등록).
# %LOCALAPPDATA%에 두지 않는 이유: Claude 데스크톱 앱(MSIX)에서 실행한 프로세스는 AppData 쓰기가 앱 전용 위치로 옮겨져, 예약 작업과 다른 폴더를 보게 된다.
$ErrorActionPreference = "Continue"
# 예약 작업 콘솔은 한국어 코드 페이지(949)라 node의 UTF-8 출력이 깨지므로 UTF-8로 읽는다
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$base = Join-Path $env:USERPROFILE "mbng-watch"
$dir = Join-Path $base "MBNG-Advisor"
$log = Join-Path $base "watch.log"
$sum = Join-Path $base "summary.md"
# 근거 가이드 본문 보관(바뀐 낱말 비교·기준일만 바뀐 변경 자동 처리용). 넥슨 글이라 저장소에는 올리지 않는다
$pages = Join-Path $base "pages"
New-Item -ItemType Directory -Force $base | Out-Null
function W($m) { $s = "$m".Trim(); if ($s -and $s -notmatch "RemoteException") { Add-Content -Path $log -Value ("[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] " + $s) -Encoding UTF8 } }
# Windows 알림(누르면 $file을 연다). 별도 모듈 없이 Windows 기본 알림 API를 쓴다
function Toast($title, $body, $file) {
  try {
    $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    $e = { param($s) [Security.SecurityElement]::Escape([string]$s) }
    $x = New-Object Windows.Data.Xml.Dom.XmlDocument
    $x.LoadXml('<toast activationType="protocol" launch="' + (& $e ([Uri]$file).AbsoluteUri) + '"><visual><binding template="ToastGeneric"><text>MBNG Advisor · ' + (& $e $title) + '</text><text>' + (& $e $body) + '</text></binding></visual></toast>')
    $app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($x))
  } catch { W ("알림 실패: " + $_) }
}
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
  node tools/watch-official.mjs --summary $sum --pages-dir $pages 2>&1 | ForEach-Object { W $_ }
  node tools/build.mjs 2>&1 | ForEach-Object { W $_ }
  if (git status --porcelain data api "MBNG Advisor.html") {
    git add data api "MBNG Advisor.html"
    git commit --quiet -m "공식 글 감시 결과 반영" 2>&1 | ForEach-Object { W $_ }
    git push --quiet 2>&1 | ForEach-Object { W $_ }
  }
  # 재확인이 필요한 글이 있으면 요약을 날짜별로 남기고 알림을 띄운다
  if (Test-Path $sum) {
    $keep = Join-Path $base ("재확인-" + (Get-Date -Format "yyyyMMdd-HHmm") + ".md")
    Copy-Item $sum $keep
    $items = @(Get-Content $sum -Encoding UTF8 | ForEach-Object { if ($_ -match '^- \[(.+?)\]\(') { $Matches[1] } })
    Toast ("공식 글 재확인 필요 " + $items.Count + "건") (($items -join " / ") + " · 눌러서 요약 열기") $keep
    W ("재확인 요약: " + $keep)
  }
} catch { W ("오류: " + $_) }
# 기록은 최근 2000줄만 남긴다
$L = Get-Content $log -Encoding UTF8; if ($L.Count -gt 2000) { $L | Select-Object -Last 2000 | Set-Content $log -Encoding UTF8 }
