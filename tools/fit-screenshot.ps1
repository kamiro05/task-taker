# Подгоняет произвольный скриншот под размер, который требует Chrome Web Store.
#
# Магазин принимает РОВНО 1280x800 или 640x400, PNG без альфа-канала (или JPEG).
# Снимок попапа — узкий (около 360 px), поэтому его нельзя просто растянуть:
# растянутый интерфейс выглядит мыльным. Скрипт кладёт снимок как есть по центру
# холста нужного размера, а уменьшает только если он в холст не влезает.
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File tools\fit-screenshot.ps1 снимок.png
#   powershell -ExecutionPolicy Bypass -File tools\fit-screenshot.ps1 снимок.png -Width 640 -Height 400

param(
  [Parameter(Mandatory = $true)][string]$Path,
  [int]$Width = 1280,
  [int]$Height = 800,
  [string]$Background = "#0f1318",
  [string]$OutPath = ""
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Path)) { throw "Файл не найден: $Path" }
$src = [System.Drawing.Image]::FromFile((Resolve-Path $Path))

# Поля по 24 px, чтобы снимок не упирался в край холста.
$maxW = $Width - 48
$maxH = $Height - 48
$scale = [Math]::Min([Math]::Min($maxW / $src.Width, $maxH / $src.Height), 1.0)
$w = [int]($src.Width * $scale)
$h = [int]($src.Height * $scale)
$x = [int](($Width - $w) / 2)
$y = [int](($Height - $h) / 2)

# Format24bppRgb — без альфа-канала, как требует магазин.
$bmp = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml($Background))
$g.InterpolationMode = "HighQualityBicubic"
$g.PixelOffsetMode = "HighQuality"
$g.DrawImage($src, $x, $y, $w, $h)
$g.Dispose()
$src.Dispose()

if (-not $OutPath) {
  $dir = Split-Path (Resolve-Path $Path)
  $name = [IO.Path]::GetFileNameWithoutExtension($Path)
  $OutPath = Join-Path $dir ("$name-$Width" + "x$Height.png")
}
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

if ($scale -lt 1.0) {
  "Снимок уменьшен до {0:P0}, чтобы уместиться в холст." -f $scale
}
"Готово: $OutPath ($Width x $Height, 24-bit PNG без альфы)"
