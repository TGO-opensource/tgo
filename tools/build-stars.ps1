# Builds data/stars-hyg.bin.gz: every HYG v3.8 star with a parallax that is not already in data/stars.bin (the named, hand-picked set),
# brightest first. Layout (little-endian): 'TGOS', u32 count, u32 version=1, then
#   f32 x,y,z (parsecs, ICRF equatorial), f32 absolute magnitude   per star, interleaved
#   i16 B-V x1000, u32 catalog number, u8 catalog (1 HIP, 2 HD, 0 none), u8 spectral class letter (ASCII)   each as its own block
param([string]$Csv = (Join-Path $PSScriptRoot 'raw\hyg\hyg_v38.csv.gz'), [string]$Data = (Join-Path $PSScriptRoot '..\data'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName Microsoft.VisualBasic
$inv = [Globalization.CultureInfo]::InvariantCulture

# stars already shipped, keyed by position (0.05 pc) and absolute magnitude (0.1)
$have = [Collections.Generic.HashSet[string]]::new()
$b = [IO.File]::ReadAllBytes((Join-Path $Data 'stars.bin'))
for ($o = 0; $o -lt $b.Length; $o += 20) {
  $x = [BitConverter]::ToSingle($b, $o); $y = [BitConverter]::ToSingle($b, $o + 4); $z = [BitConverter]::ToSingle($b, $o + 8); $m = [BitConverter]::ToSingle($b, $o + 12)
  [void]$have.Add(('{0},{1},{2},{3}' -f [Math]::Round($x * 20), [Math]::Round($y * 20), [Math]::Round($z * 20), [Math]::Round($m * 10)))
}

$gz = [IO.Compression.GZipStream]::new([IO.File]::OpenRead((Resolve-Path $Csv)), [IO.Compression.CompressionMode]::Decompress)
$p = [Microsoft.VisualBasic.FileIO.TextFieldParser]::new($gz); $p.SetDelimiters(','); $p.HasFieldsEnclosedInQuotes = $true
$h = $p.ReadFields(); $ix = @{}; for ($i = 0; $i -lt $h.Length; $i++) { $ix[$h[$i]] = $i }
$rows = [Collections.Generic.List[object]]::new(); $dup = 0; $nopx = 0
while (-not $p.EndOfData) {
  $f = $p.ReadFields()
  if ($f[$ix.id] -eq '0') { continue }
  $dist = [double]::Parse($f[$ix.dist], $inv); if ($dist -ge 100000 -or $dist -le 0) { $nopx++; continue }
  $x = [double]::Parse($f[$ix.x], $inv); $y = [double]::Parse($f[$ix.y], $inv); $z = [double]::Parse($f[$ix.z], $inv); $am = [double]::Parse($f[$ix.absmag], $inv)
  $k = '{0},{1},{2},{3}' -f [Math]::Round([single]$x * 20), [Math]::Round([single]$y * 20), [Math]::Round([single]$z * 20), [Math]::Round([single]$am * 10)
  if ($have.Contains($k)) { $dup++; continue }
  $ci = 0.65; [void][double]::TryParse($f[$ix.ci], [Globalization.NumberStyles]::Float, $inv, [ref]$ci)
  $cat = 0; $num = 0; if ($f[$ix.hip]) { $cat = 1; $num = [uint32]$f[$ix.hip] } elseif ($f[$ix.hd]) { $cat = 2; $num = [uint32]$f[$ix.hd] }
  $sp = $f[$ix.spect]; $cls = if ($sp) { [byte][char]$sp[0] } else { [byte]0 }
  $rows.Add([pscustomobject]@{ mag = [double]::Parse($f[$ix.mag], $inv); x = $x; y = $y; z = $z; am = $am; ci = $ci; cat = $cat; num = $num; cls = $cls })
}
$p.Close()
$rows = $rows | Sort-Object mag
$n = $rows.Count
$ms = [IO.MemoryStream]::new(); $w = [IO.BinaryWriter]::new($ms)
$w.Write([Text.Encoding]::ASCII.GetBytes('TGOS')); $w.Write([uint32]$n); $w.Write([uint32]1)
foreach ($r in $rows) { $w.Write([single]$r.x); $w.Write([single]$r.y); $w.Write([single]$r.z); $w.Write([single]$r.am) }
foreach ($r in $rows) { $w.Write([int16][Math]::Max(-32000, [Math]::Min(32000, [Math]::Round($r.ci * 1000)))) }
if ($n % 2) { $w.Write([int16]0) }   # keep the next block 4-byte aligned for a Uint32Array view
foreach ($r in $rows) { $w.Write([uint32]$r.num) }
foreach ($r in $rows) { $w.Write([byte]$r.cat) }
foreach ($r in $rows) { $w.Write([byte]$r.cls) }
$w.Flush()
$out = Join-Path $Data 'stars-hyg.bin.gz'
$fs = [IO.File]::Create($out); $gzw = [IO.Compression.GZipStream]::new($fs, [IO.Compression.CompressionLevel]::Optimal); $ms.Position = 0; $ms.CopyTo($gzw); $gzw.Dispose(); $fs.Dispose()
"wrote $n stars ({0:N0} KB raw, {1:N0} KB gzipped); skipped $dup already shipped, $nopx without parallax" -f ($ms.Length / 1KB), ((Get-Item $out).Length / 1KB)
