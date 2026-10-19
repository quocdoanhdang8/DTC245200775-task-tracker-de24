# Run this file in an interactive Windows PowerShell session, not an agent background terminal.
[CmdletBinding()]
param(
    [string]$RepoPath = 'D:\Projects\DTC245200775-task-tracker-de24',
    [switch]$Push,
    [switch]$Resume,
    [switch]$CaptureSession
)
$ErrorActionPreference = 'Stop'

# A visible classic console gives CopyFromScreen a real desktop window to capture.
if (-not $CaptureSession) {
    $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $conhost = Join-Path $env:WINDIR 'System32\conhost.exe'
    $launch = '"{0}" -NoProfile -STA -ExecutionPolicy Bypass -File "{1}" -RepoPath "{2}" -CaptureSession' -f $powershell, $PSCommandPath, $RepoPath
    if ($Push) { $launch += ' -Push' }
    if ($Resume) { $launch += ' -Resume' }
    Start-Process -FilePath $conhost -ArgumentList $launch
    return
}

# Windows PowerShell otherwise decodes UTF-8 output from Node/Docker as an OEM code page.
& "$env:WINDIR\System32\chcp.com" 65001 | Out-Null
$evidenceUtf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $evidenceUtf8
[Console]::OutputEncoding = $evidenceUtf8
$global:OutputEncoding = $evidenceUtf8
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class EvidenceWindow {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][EvidenceWindow]::SetProcessDPIAware()
$script:ConsoleHandle = [EvidenceWindow]::GetConsoleWindow()
$script:ActiveLog = $null
$script:LastOutput = @()
$script:Committed = $false
$script:Failed = $false
$script:TempRoot = Join-Path $env:TEMP ('task-tracker-evidence-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $script:TempRoot -Force | Out-Null
$shotTemp = Join-Path $script:TempRoot 'screenshots'
$logTemp = Join-Path $script:TempRoot 'logs'
New-Item -ItemType Directory -Path $shotTemp, $logTemp -Force | Out-Null

function Write-Evidence([string]$Text) {
    # Keep source output readable, normalizing only invisible trailing spaces/tabs.
    $Text = (($Text -split '\r?\n') | ForEach-Object { $_.TrimEnd([char[]]@(' ', "`t")) }) -join [Environment]::NewLine
    Write-Host $Text
    if ($script:ActiveLog) { Add-Content -LiteralPath $script:ActiveLog -Value $Text -Encoding UTF8 }
}

function Invoke-Checked([string]$Program, [string[]]$NativeArgs) {
    $script:LastOutput = @()
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Program @NativeArgs 2>&1 | ForEach-Object {
            $line = $_.ToString() -replace '\x1b\[[0-?]*[ -/]*[@-~]', ''
            $script:LastOutput += $line
            Write-Evidence $line
        }
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "$Program exited with code $code." }
}

function Get-NativeText([string]$Program, [string[]]$NativeArgs) {
    $lines = & $Program @NativeArgs
    if ($LASTEXITCODE -ne 0) { throw "$Program failed during preflight/inspection." }
    return ($lines -join "`n")
}

function Get-Services {
    $raw = (Get-NativeText 'docker' @('compose', 'ps', '-a', '--format', 'json')).Trim()
    if (-not $raw) { throw 'Compose did not return any containers.' }
    if ($raw.StartsWith('[')) { return @($raw | ConvertFrom-Json) }
    return @($raw -split "`n" | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
}

function Wait-Services {
    for ($attempt = 1; $attempt -le 40; $attempt++) {
        $services = @(Get-Services)
        $bad = @($services | Where-Object {
            if ($_.Service -eq 'log-init') { $_.State -ne 'exited' -or [int]$_.ExitCode -ne 0 }
            else { $_.State -ne 'running' -or $_.Health -in @('starting', 'unhealthy') }
        })
        if ($services.Count -eq 12 -and $bad.Count -eq 0) { return }
        Write-Host "Waiting for Compose services ($attempt/40)..."
        Start-Sleep -Seconds 3
    }
    throw 'Compose services did not become ready. Existing evidence has not been replaced.'
}

function Save-ConsoleScreenshot([string]$Path) {
    if (-not [EvidenceWindow]::IsWindowVisible($script:ConsoleHandle)) {
        throw 'No visible interactive console. Run the downloaded script from your desktop PowerShell.'
    }
    [void][EvidenceWindow]::ShowWindow($script:ConsoleHandle, 3)
    [void][EvidenceWindow]::SetForegroundWindow($script:ConsoleHandle)
    Start-Sleep -Milliseconds 900
    if ([EvidenceWindow]::GetForegroundWindow() -ne $script:ConsoleHandle) {
        throw 'Console is not foreground. Capture stopped to avoid photographing another app.'
    }
    $rect = New-Object EvidenceWindow+Rect
    if (-not [EvidenceWindow]::GetWindowRect($script:ConsoleHandle, [ref]$rect)) { throw 'Cannot read console window bounds.' }
    $bounds = [System.Drawing.Rectangle]::FromLTRB($rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
    $bounds = [System.Drawing.Rectangle]::Intersect($bounds, [System.Windows.Forms.SystemInformation]::VirtualScreen)
    if ($bounds.Width -lt 600 -or $bounds.Height -lt 400) { throw 'Console window is too small to capture readable evidence.' }
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    if ((Get-Item -LiteralPath $Path).Length -lt 5000) { throw 'Screenshot is unexpectedly small; capture was not accepted.' }
}

function Capture-Step([string]$Name, [string]$LogName, [string]$CommandLabel, [scriptblock]$Action) {
    Clear-Host
    $Host.UI.RawUI.WindowTitle = 'Windows PowerShell'
    $script:ActiveLog = Join-Path $logTemp $LogName
    Set-Content -LiteralPath $script:ActiveLog -Value ('Captured: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')) -Encoding UTF8
    Write-Evidence ('PS ' + $RepoPath + '> ' + $CommandLabel)
    & $Action
    Write-Evidence ('COMPLETED: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    Save-ConsoleScreenshot (Join-Path $shotTemp ($Name + '.png'))
    $script:ActiveLog = $null
}

function Export-Report([string]$DocxPath, [string]$PdfPath, [string]$MapPath) {
    $word = $null
    $document = $null
    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $word.DisplayAlerts = 0
        $document = $word.Documents.Open($DocxPath, $false, $false)
        [void]$document.Fields.Update()
        [void]$document.Repaginate()
        $pages = [int]$document.ComputeStatistics(2)
        $headings = @()
        foreach ($paragraph in $document.Paragraphs) {
            if ([int]$paragraph.OutlineLevel -eq 1) {
                $text = $paragraph.Range.Text.Trim([char]13, [char]7).Trim()
                if ($text) {
                    $headings += [pscustomobject]@{ text = $text; page = [int]$paragraph.Range.Information(3) }
                }
            }
        }
        $document.Save()
        $document.ExportAsFixedFormat($PdfPath, 17)
        [pscustomobject]@{ pages = $pages; headings = $headings } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $MapPath -Encoding UTF8
        if ($pages -lt 10) { throw "Report has only $pages pages; minimum is 10." }
        return $pages
    } finally {
        if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
        if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
    }
}

# This helper updates source text/log excerpts and the manual TOC. It never draws screenshots.
$pythonHelper = @'
import json, re, sys, unicodedata, zipfile
from pathlib import Path

def folded(value):
    value = value.replace('\u0110', 'D').replace('\u0111', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', value) if not unicodedata.combining(c)).casefold()

def key(value):
    value = folded(value)
    match = re.search(r'chuong\s+(\d+)', value)
    if match: return 'chapter_' + match[1]
    for needle, name in [('loi cam on', 'thanks'), ('muc luc', 'toc'), ('ket luan', 'conclusion'),
                         ('tai lieu tham khao', 'references'), ('phu luc a', 'appendix_a'), ('phu luc b', 'appendix_b')]:
        if needle in value: return name

repo, mode = Path(sys.argv[1]), sys.argv[2]
source = repo / 'docs/bao-cao-de24.md'
text = source.read_text(encoding='utf-8-sig')
text = '\n'.join(line.rstrip(' \t') for line in text.splitlines()) + '\n'
if mode == 'logs':
    if '<!-- REPORT_COMPACT -->' not in text:
        pairs = {
            'api-e2e-terminal.png': 'verify_e2e.log', 'loki-logql-verification.png': 'check_loki.log',
            'unit-api-tests.png': 'unit_tests.log', 'hardening-verification.png': 'hardening.log',
            'networks-db-roles.png': 'networks_roles.log', 'persistence-restart.png': 'test_persistence.log'
        }
        for image, log in pairs.items():
            marker = '(screenshots/' + image + ')'
            start = text.find(marker)
            if start < 0: raise RuntimeError('Missing report image reference: ' + image)
            end = text.find('\n##', start)
            if end < 0: end = len(text)
            section = text[start:end]
            captured = (repo / 'docs/logs' / log).read_text(encoding='utf-8-sig')
            captured = '\n'.join(line.rstrip(' \t') for line in captured.splitlines()).strip()
            match = re.search(r'```(?:text|powershell)\s*\n.*?\n```', section, re.S)
            if not match: raise RuntimeError('Cannot find raw output block for: ' + image)
            # Replace only the existing raw-output block; preserve the rest of the report.
            section = section[:match.start()] + '```text\n' + captured + '\n```' + section[match.end():]
            text = text[:start] + section + text[end:]
    text = text.replace('\u1ea2nh tr\u00edch xu\u1ea5t k\u1ebft qu\u1ea3', '\u1ea2nh ch\u1ee5p c\u1eeda s\u1ed5 PowerShell ghi nh\u1eadn k\u1ebft qu\u1ea3')
    source.write_text(text, encoding='utf-8')
elif mode == 'toc':
    info = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8-sig'))
    headings = []
    for heading in info['headings']:
        name = key(heading['text'])
        if name: headings.append((name, int(heading['page'])))
    ranges = {}
    for index, (name, page) in enumerate(headings):
        last = headings[index + 1][1] - 1 if index + 1 < len(headings) else int(info['pages'])
        ranges[name] = str(page) if last <= page else str(page) + '\u2013' + str(last)
    in_toc = False
    count = 0
    lines = text.splitlines(keepends=True)
    for index, line in enumerate(lines):
        if line.startswith('# ') and key(line) == 'toc': in_toc = True; continue
        if in_toc and line.strip() == '<!-- PAGEBREAK -->': in_toc = False
        if in_toc and line.startswith('|'):
            cells = line.strip().strip('|').split('|')
            name = key(cells[0])
            if len(cells) == 2 and name in ranges:
                new = '| ' + cells[0].strip() + ' | ' + ranges[name] + ' |\n'
                if new != line: count += 1
                lines[index] = new
    new_text = ''.join(lines)
    source.write_text(new_text, encoding='utf-8')
    print('TOC_CHANGED=' + str(count))
elif mode == 'check':
    if re.search(r'\[(?:H\u1ecc V\u00c0 T\u00caN|MSSV|L\u1edaP|GI\u1ea2NG VI\u00caN)\]', text):
        raise RuntimeError('Personal details still contain placeholders.')
    with zipfile.ZipFile(repo / 'docs/bao-cao-de24.docx') as archive:
        images = [name for name in archive.namelist() if name.startswith('word/media/') and not name.endswith('/')]
        if len(images) < 18: raise RuntimeError('Expected at least 18 embedded images; found ' + str(len(images)))
        from xml.etree import ElementTree as ET
        root = ET.fromstring(archive.read('word/document.xml'))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        if any(len(table.findall('./w:tblGrid/w:gridCol', ns)) > 6 for table in root.findall('.//w:tbl', ns)):
            raise RuntimeError('A report table has more than six columns; inspect Markdown table parsing.')
        print('EMBEDDED_IMAGES=' + str(len(images)))
'@

try {
    if (-not [Environment]::UserInteractive -or -not [EvidenceWindow]::IsWindowVisible($script:ConsoleHandle)) {
        throw 'This needs an unlocked interactive Windows desktop. Background agent terminals cannot capture it.'
    }
    Set-Location -LiteralPath $RepoPath
    foreach ($program in @('docker', 'git', 'node', 'npm.cmd', 'python', 'curl.exe')) {
        if (-not (Get-Command $program -ErrorAction SilentlyContinue)) { throw "Missing command: $program" }
    }
    if (-not (Test-Path '.env')) { throw 'Existing project .env is missing. This script will not create or reveal passwords.' }
    $remote = Get-NativeText 'git' @('remote', 'get-url', 'origin')
    if ($remote -notmatch '^https://github\.com/quocdoanhdang8/DTC245200775-task-tracker-de24(?:\.git)?/?$') { throw 'Unexpected remote; stopped before any changes.' }
    $dirty = Get-NativeText 'git' @('status', '--porcelain', '--untracked-files=all')
    if ($dirty.Trim()) {
        if (-not $Resume) { throw ('Working tree is not clean. Use -Resume only for files from the previous failed capture. Existing work was preserved: ' + $dirty) }
        $alreadyStaged = Get-NativeText 'git' @('diff', '--cached', '--name-only')
        if ($alreadyStaged.Trim()) { throw 'There are already staged files. Resolve them before using -Resume; nothing was reset or unstaged.' }
        $allowedResume = @('docs/bao-cao-de24.md', 'docs/bao-cao-de24.docx', 'docs/build_report.py', 'docs/architecture.png', 'scripts/capture-evidence.ps1')
        $allowedResume += @('compose-startup', 'services-status', 'api-e2e-terminal', 'security-headers', 'loki-logql-verification', 'unit-api-tests', 'hardening-verification', 'networks-db-roles', 'persistence-restart') | ForEach-Object { 'docs/screenshots/' + $_ + '.png' }
        $allowedResume += @('compose_startup', 'services_status', 'verify_e2e', 'security_headers', 'check_loki', 'unit_tests', 'hardening', 'networks_roles', 'test_persistence') | ForEach-Object { 'docs/logs/' + $_ + '.log' }
        foreach ($line in ($dirty -split "`n")) {
            if ($line.Length -ge 4 -and $line.Substring(3).Trim() -notin $allowedResume) {
                throw ('Unrelated changes found; -Resume stopped without modifying them: ' + $line)
            }
        }
        Write-Host 'Resuming: only known report/capture outputs are modified. They will be backed up and recaptured.'
    }
    if ((Get-NativeText 'git' @('branch', '--show-current')).Trim() -ne 'main') { throw 'Expected branch main; existing branch was not changed.' }
    & git check-ignore -q .env
    if ($LASTEXITCODE -ne 0) { throw '.env is not ignored. Fix this before running.' }
    foreach ($file in @('scripts/verify_e2e.js', 'scripts/check_loki.js', 'scripts/test_persistence.js', 'docs/build_report.py', 'docs/bao-cao-de24.md')) {
        if (-not (Test-Path -LiteralPath $file)) { throw "Missing project file: $file. Use the latest project checkout." }
    }
    # These existing browser captures are retained, not fabricated or overwritten.
    $browserImages = @('task-tracker-ui.png', 'task-create.png', 'task-filter.png', 'pgadmin-tasks.png', 'prometheus-targets.png', 'prometheus-metric-query.png', 'grafana-dashboard.png', 'grafana-explore.png')
    foreach ($imageName in $browserImages) {
        $imagePath = Join-Path $RepoPath ('docs/screenshots/' + $imageName)
        if (-not (Test-Path -LiteralPath $imagePath)) { throw "Missing existing browser capture: $imageName. Do not substitute a terminal image." }
        $imageProbe = [System.Drawing.Image]::FromFile($imagePath)
        try { if ($imageProbe.Width -lt 600) { throw "Browser capture is too small: $imageName" } }
        finally { $imageProbe.Dispose() }
    }
    # Check Word and desktop capture before running any lengthy operations.
    $wordProbe = New-Object -ComObject Word.Application
    $wordProbe.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wordProbe)
    Save-ConsoleScreenshot (Join-Path $script:TempRoot 'desktop-preflight.png')
    Remove-Item -LiteralPath (Join-Path $script:TempRoot 'desktop-preflight.png')

    Capture-Step 'compose-startup' 'compose_startup.log' 'docker compose config --quiet; docker compose up -d --build' {
        Invoke-Checked 'docker' @('compose', 'config', '--quiet')
        Write-Evidence 'Compose configuration: exit 0'
        Invoke-Checked 'docker' @('compose', 'up', '-d', '--build')
    }
    Wait-Services
    Capture-Step 'services-status' 'services_status.log' 'docker compose ps -a --format json (formatted as a readable service table)' {
        $services = @(Get-Services)
        $columns = @('Service', 'State', 'Health', @{Name='Published';Expression={
            (@($_.Publishers) | Where-Object { $_.PublishedPort -gt 0 } | ForEach-Object { "$($_.URL):$($_.PublishedPort)->$($_.TargetPort)" }) -join ', '
        }})
        $table = $services | Select-Object -Property $columns | Format-Table -AutoSize | Out-String -Width 190
        Write-Evidence $table.TrimEnd()
        Write-Evidence 'Verified: 12 services; log-init completed with exit 0; application services are running.'
    }
    Capture-Step 'api-e2e-terminal' 'verify_e2e.log' 'node scripts/verify_e2e.js' {
        Invoke-Checked 'node' @('scripts/verify_e2e.js')
    }
    Capture-Step 'security-headers' 'security_headers.log' 'curl.exe --noproxy * --max-time 15 --fail -sS -I http://127.0.0.1:8080/' {
        Invoke-Checked 'curl.exe' @('--noproxy', '*', '--max-time', '15', '--fail', '-sS', '-I', 'http://127.0.0.1:8080/')
        $headers = $script:LastOutput -join "`n"
        foreach ($header in @('Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy')) {
            if ($headers -notmatch ('(?im)^' + [regex]::Escape($header) + ':')) { throw "Missing header: $header" }
        }
    }
    Capture-Step 'loki-logql-verification' 'check_loki.log' 'node scripts/check_loki.js' {
        Invoke-Checked 'node' @('scripts/check_loki.js')
    }
    Capture-Step 'unit-api-tests' 'unit_tests.log' '$env:LOG_LEVEL=''silent''; npm --prefix app test -- --test-reporter=spec' {
        # Expected mock database failures remain asserted; silence only application logging in this test process.
        $previousLogLevel = $env:LOG_LEVEL
        try {
            $env:LOG_LEVEL = 'silent'
            Invoke-Checked 'npm.cmd' @('--prefix', 'app', 'test', '--', '--test-reporter=spec')
        } finally {
            if ($null -eq $previousLogLevel) { Remove-Item Env:LOG_LEVEL -ErrorAction SilentlyContinue }
            else { $env:LOG_LEVEL = $previousLogLevel }
        }
    }
    Capture-Step 'hardening-verification' 'hardening.log' 'docker compose exec -T task-app id; docker compose exec -T nginx id; docker inspect (selected fields only)' {
        foreach ($service in @('task-app', 'nginx')) {
            Write-Evidence "SERVICE: $service"
            Invoke-Checked 'docker' @('compose', 'exec', '-T', $service, 'id')
            $id = (Get-NativeText 'docker' @('compose', 'ps', '-q', $service)).Trim()
            $format = 'User={{.Config.User}} | ReadOnly={{.HostConfig.ReadonlyRootfs}} | CapDrop={{json .HostConfig.CapDrop}} | SecurityOpt={{json .HostConfig.SecurityOpt}}'
            Invoke-Checked 'docker' @('inspect', '--format', $format, $id)
            $config = $script:LastOutput -join "`n"
            if ($config -notmatch 'ReadOnly=true' -or $config -notmatch 'ALL' -or $config -notmatch 'no-new-privileges:true') { throw "$service hardening did not match expected configuration." }
        }
    }
    Capture-Step 'networks-db-roles' 'networks_roles.log' 'docker network inspect; PostgreSQL role query; published-port inspection' {
        Invoke-Checked 'docker' @('network', 'inspect', 'task-tracker-de24_data', 'task-tracker-de24_observability', '--format', '{{.Name}} Internal={{.Internal}}')
        if (@($script:LastOutput | Where-Object { $_ -match 'Internal=true' }).Count -ne 2) { throw 'Expected two internal networks.' }
        $sql = "SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolname IN ('task_app','metrics_exporter','postgres') ORDER BY rolname;"
        Invoke-Checked 'docker' @('compose', 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'task_tracker', '-c', $sql)
        $roleLog = $script:LastOutput -join "`n"
        if ($roleLog -notmatch 'task_app\s+\|\s+f' -or $roleLog -notmatch 'metrics_exporter\s+\|\s+f') { throw 'Application/exporter roles are not both non-superuser.' }
        $services = @(Get-Services)
        foreach ($service in $services) {
            $ports = @($service.Publishers | Where-Object { $_.PublishedPort -gt 0 })
            if ($service.Service -in @('task-app', 'db') -and $ports.Count -gt 0) { throw 'Application or PostgreSQL has a published host port.' }
            foreach ($port in $ports) {
                if ($port.URL -ne '127.0.0.1') { throw 'A service publishes outside host loopback.' }
                Write-Evidence "$($service.Service): $($port.URL):$($port.PublishedPort)->$($port.TargetPort)"
            }
        }
        Write-Evidence 'Verified: app/database ports are not published; admin/web ports bind to 127.0.0.1.'
    }
    Capture-Step 'persistence-restart' 'test_persistence.log' 'node scripts/test_persistence.js' {
        if (Test-Path '.persistence_marker.tmp') { throw 'An existing persistence marker needs review before another test.' }
        Invoke-Checked 'node' @('scripts/test_persistence.js')
        Write-Evidence 'Git history at capture time:'
        Invoke-Checked 'git' @('log', '-5', '--oneline')
    }
    Wait-Services

    $shots = @(Get-ChildItem -LiteralPath $shotTemp -Filter '*.png')
    if ($shots.Count -ne 9) { throw 'Expected exactly nine real screenshots; existing report images were not replaced.' }
    $backup = Join-Path $script:TempRoot 'original-report'
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -LiteralPath 'docs/bao-cao-de24.md', 'docs/bao-cao-de24.docx' -Destination $backup
    Copy-Item -LiteralPath 'docs/screenshots' -Destination (Join-Path $backup 'screenshots') -Recurse
    Copy-Item -Path (Join-Path $shotTemp '*.png') -Destination 'docs/screenshots' -Force
    New-Item -ItemType Directory -Path 'docs/logs' -Force | Out-Null
    Copy-Item -Path (Join-Path $logTemp '*.log') -Destination 'docs/logs' -Force
    $canonicalScript = Join-Path $RepoPath 'scripts/capture-evidence.ps1'
    if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($canonicalScript)) { Copy-Item -LiteralPath $PSCommandPath -Destination $canonicalScript -Force }
    $helperPath = Join-Path $script:TempRoot 'update-report-source.py'
    Set-Content -LiteralPath $helperPath -Value $pythonHelper -Encoding UTF8
    Invoke-Checked 'python' @($helperPath, $RepoPath, 'logs')
    $renderFolder = Join-Path $RepoPath 'docs/rendered'
    New-Item -ItemType Directory -Path $renderFolder -Force | Out-Null
    $mapPath = Join-Path $script:TempRoot 'report-pages.json'
    $docxPath = Join-Path $RepoPath 'docs/bao-cao-de24.docx'
    $pdfPath = Join-Path $renderFolder 'bao-cao-de24.pdf'
    $stable = $false
    for ($pass = 1; $pass -le 4; $pass++) {
        Invoke-Checked 'python' @('docs/build_report.py')
        $pages = Export-Report $docxPath $pdfPath $mapPath
        Invoke-Checked 'python' @($helperPath, $RepoPath, 'toc', $mapPath)
        if (($script:LastOutput -join "`n") -match 'TOC_CHANGED=0') { $stable = $true; break }
    }
    if (-not $stable) { throw 'Manual TOC pagination did not stabilize; keep local results for inspection.' }
    if ($pages -lt 10 -or $pages -gt 32) { throw "Report has $pages pages. Inspect layout before publishing; expected 10-32 pages." }
    Invoke-Checked 'python' @($helperPath, $RepoPath, 'check')
    Invoke-Checked 'git' @('diff', '--check')
    $stage = @('docs/bao-cao-de24.md', 'docs/bao-cao-de24.docx', 'docs/build_report.py', 'docs/architecture.png', 'scripts/capture-evidence.ps1')
    $stage += @($shots | ForEach-Object { 'docs/screenshots/' + $_.Name })
    $stage += @(Get-ChildItem -LiteralPath $logTemp -Filter '*.log' | ForEach-Object { 'docs/logs/' + $_.Name })
    Invoke-Checked 'git' (@('add', '--') + $stage)
    Invoke-Checked 'git' @('diff', '--cached', '--check')
    $staged = (Get-NativeText 'git' @('diff', '--cached', '--name-only')) -split "`n"
    foreach ($file in $staged) { if ($file -and $file -notin $stage) { throw "Unexpected staged file: $file" } }
    & git diff --cached --quiet
    if ($LASTEXITCODE -eq 1) {
        Invoke-Checked 'git' @('commit', '-m', 'docs: condense report and recapture Windows PowerShell evidence')
        $script:Committed = $true
    } elseif ($LASTEXITCODE -ne 0) { throw 'Could not inspect staged diff.' }
    if ($Push) { Invoke-Checked 'git' @('push', 'origin', 'main') }
    Write-Host "`nDONE: nine real desktop captures, refreshed logs, DOCX and PDF ($pages pages)." -ForegroundColor Green
    Write-Host 'Full report: eight existing browser screenshots + nine new terminal screenshots + one architecture diagram.'
    Write-Host "DOCX: $docxPath"
    Write-Host "PDF:  $pdfPath"
    Write-Host "Backup and capture source: $script:TempRoot"
    Invoke-Checked 'git' @('status', '--short', '--branch')
} catch {
    $script:Failed = $true
    $script:ActiveLog = $null
    Write-Host "`nSTOPPED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "No fake screenshots were created. Diagnostics / partial real captures: $script:TempRoot"
    if ($script:Committed) { Write-Host 'The local commit is safe. If push failed, resolve authentication and run git push origin main.' }
    Write-Host 'Do not claim this run completed. Review the error above.'
} finally {
    Write-Host "`nPress Enter to close this capture session."
    [void](Read-Host)
}
if ($script:Failed) { exit 1 }
