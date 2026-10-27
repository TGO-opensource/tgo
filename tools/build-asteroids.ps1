# Builds data/asteroids.bin.gz from a JPL SBDB query saved as tools/raw/sbdb-asteroids.json (see README, "Rebuilding the data").
# Every orbit is moved to one shared epoch so the browser only needs time since that epoch. Layout (little-endian):
#   'TGOA', u32 count, f64 epoch (JD TDB), then f32 blocks a (AU), e, i, node, arg. perihelion, mean anomaly (radians), then u8 H x10, u8 class
#   class: 1 main belt, 2 Jupiter Trojan, 3 trans-Neptunian, 4 Centaur, 5 near-Earth, 6 other
param([string]$In = (Join-Path $PSScriptRoot 'raw\sbdb-asteroids.json'), [string]$Out = (Join-Path $PSScriptRoot '..\data\asteroids.bin.gz'), [double]$Epoch = 2461200.5)
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture
$j = Get-Content -Raw $In | ConvertFrom-Json
$f = @{}; for ($k = 0; $k -lt $j.fields.Count; $k++) { $f[$j.fields[$k]] = $k }
$cls = @{ MBA = 1; IMB = 1; OMB = 1; TJN = 2; TNO = 3; CEN = 4; APO = 5; ATE = 5; AMO = 5; IEO = 5 }
$d2r = [Math]::PI / 180; $rows = [Collections.Generic.List[object]]::new(); $skip = 0
foreach ($r in $j.data) {
  try {
    $a = [double]::Parse($r[$f.a], $inv); $e = [double]::Parse($r[$f.e], $inv)
    if ($a -le 0 -or $e -ge 1) { $skip++; continue }
    $n = 0.9856076686 / [Math]::Pow($a, 1.5)
    $M = ([double]::Parse($r[$f.ma], $inv) + $n * ($Epoch - [double]::Parse($r[$f.epoch], $inv))) % 360; if ($M -lt 0) { $M += 360 }
    $H = 0.0; [void][double]::TryParse([string]$r[$f.H], [Globalization.NumberStyles]::Float, $inv, [ref]$H)
    $c = $cls[[string]$r[$f.class]]; if (-not $c) { $c = 6 }
    $rows.Add(@($a, $e, ([double]::Parse($r[$f.i], $inv) * $d2r), ([double]::Parse($r[$f.om], $inv) * $d2r), ([double]::Parse($r[$f.w], $inv) * $d2r), ($M * $d2r), $H, $c))
  } catch { $skip++ }
}
$N = $rows.Count
$ms = [IO.MemoryStream]::new(); $w = [IO.BinaryWriter]::new($ms)
$w.Write([Text.Encoding]::ASCII.GetBytes('TGOA')); $w.Write([uint32]$N); $w.Write([double]$Epoch)
for ($k = 0; $k -lt 6; $k++) { foreach ($r in $rows) { $w.Write([single]$r[$k]) } }
foreach ($r in $rows) { $w.Write([byte][Math]::Max(0, [Math]::Min(255, [Math]::Round($r[6] * 10)))) }
foreach ($r in $rows) { $w.Write([byte]$r[7]) }
$w.Flush()
$fs = [IO.File]::Create($Out); $gz = [IO.Compression.GZipStream]::new($fs, [IO.Compression.CompressionLevel]::Optimal); $ms.Position = 0; $ms.CopyTo($gz); $gz.Dispose(); $fs.Dispose()
$byc = $rows | Group-Object { $_[7] } | Sort-Object Name | ForEach-Object { "$($_.Name):$($_.Count)" }
"wrote $N orbits ({0:N0} KB gzipped), skipped $skip; by class $($byc -join ' ')" -f ((Get-Item $Out).Length / 1KB)
