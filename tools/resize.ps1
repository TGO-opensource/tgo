# Builds the web-size maps in data/tex/ from the full-size downloads in tools/raw/ (see README, "Rebuilding the data").
# Bicubic resampling; JPEG quality 85; PNG for the ring strip so its alpha survives.
param([string]$Raw = (Join-Path $PSScriptRoot 'raw'), [string]$Out = (Join-Path $PSScriptRoot '..\data\tex'), [string[]]$Only)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Out | Out-Null
$jpeg = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$q = [Drawing.Imaging.EncoderParameters]::new(1); $q.Param[0] = [Drawing.Imaging.EncoderParameter]::new([Drawing.Imaging.Encoder]::Quality, [long]85)

function Resize([string]$src, [string]$dst, [int]$w, [int]$h) {
  if ($Only -and $dst -notin $Only) { return }   # -Only earth-2k.jpg,... rebuilds just those files
  $img = [Drawing.Image]::FromFile((Resolve-Path (Join-Path $Raw $src)))
  try {
    $bmp = [Drawing.Bitmap]::new($w, $h, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.CompositingQuality = 'HighQuality'; $g.SmoothingMode = 'HighQuality'
    $g.CompositingMode = 'SourceCopy'
    # clamp at the edges so the seam at ±180° does not pick up a dark border
    $ia = [Drawing.Imaging.ImageAttributes]::new(); $ia.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
    # JPEG has no alpha: treat the source as opaque (Celestia's io.png keeps a mask, not transparency, in its alpha channel)
    if (-not $dst.EndsWith('.png')) { $cm = [Drawing.Imaging.ColorMatrix]::new(); $cm.Matrix33 = 0; $cm.Matrix43 = 1; $ia.SetColorMatrix($cm) }
    $g.DrawImage($img, [Drawing.Rectangle]::new(0, 0, $w, $h), 0, 0, $img.Width, $img.Height, [Drawing.GraphicsUnit]::Pixel, $ia)
    $g.Dispose()
    $path = Join-Path $Out $dst
    if ($dst.EndsWith('.png')) { $bmp.Save($path, [Drawing.Imaging.ImageFormat]::Png) } else { $bmp.Save($path, $jpeg, $q) }
    $bmp.Dispose()
    '{0,-22} {1,5}x{2,-5} {3,8:N0} KB' -f $dst, $w, $h, ((Get-Item $path).Length / 1KB)
  } finally { $img.Dispose() }
}

# Solar System Scope (CC BY 4.0)
Resize 'sss\2k_sun.jpg'              'sun-2k.jpg'      2048 1024
Resize 'sss\2k_mercury.jpg'          'mercury-2k.jpg'  2048 1024
Resize 'sss\4k_venus_atmosphere.jpg' 'venus-2k.jpg'    2048 1024
Resize 'sss\2k_mars.jpg'             'mars-2k.jpg'     2048 1024
Resize 'sss\8k_mars.jpg'             'mars-4k.jpg'     4096 2048
Resize 'sss\2k_jupiter.jpg'          'jupiter-2k.jpg'  2048 1024
Resize 'sss\8k_jupiter.jpg'          'jupiter-4k.jpg'  4096 2048
Resize 'sss\2k_saturn.jpg'           'saturn-2k.jpg'   2048 1024
Resize 'sss\8k_saturn.jpg'           'saturn-4k.jpg'   4096 2048
Resize 'sss\2k_uranus.jpg'           'uranus-2k.jpg'   2048 1024
Resize 'sss\2k_neptune.jpg'          'neptune-2k.jpg'  2048 1024
Resize 'sss\8k_earth_daymap.jpg'    'earth-2k.jpg'        2048 1024
Resize 'sss\8k_earth_daymap.jpg'    'earth-4k.jpg'        4096 2048
Resize 'sss\8k_earth_nightmap.jpg'  'earth-night-2k.jpg'  2048 1024
Resize 'sss\8k_earth_clouds.jpg'    'earth-clouds-2k.jpg' 2048 1024
Resize 'sss\8k_earth_clouds.jpg'    'earth-clouds-4k.jpg' 4096 2048
Resize 'sss\2k_moon.jpg'           'moon-2k.jpg'     2048 1024
Resize 'sss\8k_moon.jpg'             'moon-4k.jpg'     4096 2048
Resize 'sss\8k_saturn_ring_alpha.png' 'saturn-ring.png' 2048 16
Resize 'sss\8k_stars_milky_way.jpg'  'milkyway-4k.jpg' 4096 2048
# Celestia content, per-file licences (README lists them)
Resize 'celestia\io.png'       'io-2k.jpg'       2048 1024
Resize 'celestia\ganymede.jpg' 'ganymede-2k.jpg' 2048 1024
Resize 'celestia\triton.jpg'   'triton-2k.jpg'   2048 1024
Resize 'celestia\ariel.jpg'    'ariel-1k.jpg'    1024 512
Resize 'celestia\miranda.jpg'  'miranda-1k.jpg'  1024 512
Resize 'celestia\phobos.jpg'   'phobos-1k.jpg'   1024 512
Resize 'celestia\deimos.jpg'   'deimos-1k.jpg'   1024 512
