# 날샘 보고서 양식 변환: DOCX -> (목차 갱신) DOCX, PDF (Microsoft Word) / HWP, HWPX (한컴 한글)
# 사용: powershell -ExecutionPolicy Bypass -File tools\convert_report.ps1
#   -SkipHwp : 한글 변환 생략
# Word·한글 창이 화면에 잠깐 뜹니다. '문서 복구'나 '파일 접근 허용' 확인 창이 뜨면 눌러주세요.
param(
  [string]$Docx = (Join-Path $PSScriptRoot '..\report\downloads\nalssam-report.docx'),
  [switch]$SkipHwp
)
$ErrorActionPreference = 'Stop'
$Docx = (Resolve-Path $Docx).Path
$dir  = Split-Path $Docx
$base = [IO.Path]::GetFileNameWithoutExtension($Docx)

# 강제 종료된 Word가 남긴 잠금 파일(~$...)이 있으면 '사용 중' 확인 창에서 멈추므로 먼저 정리
Get-ChildItem $dir -Force -Filter '~$*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# ---- Word: 목차 갱신 + PDF ----
$word = New-Object -ComObject Word.Application
$word.Visible = $true
try {
  $doc = $word.Documents.Open($Docx, $false, $false, $false)
  foreach ($toc in $doc.TablesOfContents) {
    $toc.Update()                       # Fields.Update() 는 확인 창을 띄워 멈출 수 있어 쓰지 않음
    $pf = $toc.Range.ParagraphFormat    # 목차를 한 쪽에 담도록 줄 간격만 좁힘
    $pf.SpaceBefore = 0; $pf.SpaceAfter = 2; $pf.LineSpacingRule = 0
  }
  $doc.Save()
  $pdf = Join-Path $dir "$base.pdf"
  $doc.ExportAsFixedFormat($pdf, 17)    # 17 = wdExportFormatPDF
  $doc.Close([ref]0)
  Write-Output "PDF  -> $pdf"
} finally {
  $word.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
}

if ($SkipHwp) { return }

# ---- 한글: HWP, HWPX ----
$hwp = New-Object -ComObject HWPFrame.HwpObject
try {
  $hwp.XHwpWindows.Item(0).Visible = $true
  if (-not $hwp.Open($Docx, '', 'forceopen:true')) { throw '한글에서 DOCX를 열지 못했습니다 (접근 허용 창을 확인하세요).' }
  $h1 = Join-Path $dir "$base.hwp"
  $h2 = Join-Path $dir "$base.hwpx"
  [void]$hwp.SaveAs($h1, 'HWP', '')
  [void]$hwp.SaveAs($h2, 'HWPX', '')
  Write-Output "HWP  -> $h1"
  Write-Output "HWPX -> $h2"
} finally {
  $hwp.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($hwp)
}
