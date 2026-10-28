# A small static web server for running TGO locally (browsers will not load data/ from a file:// page).
#   pwsh -File tools/serve.ps1            then open http://localhost:8765/
# PUT /upload/<name> saves the request body to tools/raw/<name>; the data build uses it to bring in JSON fetched in a browser.
param([int]$Port = 8765, [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')))
$raw = Join-Path $PSScriptRoot 'raw'
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.css' = 'text/css'; '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.bin' = 'application/octet-stream'; '.gz' = 'application/gzip'; '.md' = 'text/plain; charset=utf-8'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'; '.wasm' = 'application/wasm' }
$l = [System.Net.HttpListener]::new(); $l.Prefixes.Add("http://localhost:$Port/"); $l.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
while ($l.IsListening) {
  $ctx = $l.GetContext(); $req = $ctx.Request; $res = $ctx.Response
  try {
    $res.Headers['Access-Control-Allow-Origin'] = '*'; $res.Headers['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS'; $res.Headers['Access-Control-Allow-Headers'] = '*'
    $res.Headers['Access-Control-Allow-Private-Network'] = 'true'; $res.Headers['Cache-Control'] = 'no-store'
    $p = [Uri]::UnescapeDataString($req.Url.AbsolutePath.TrimStart('/'))
    if ($req.HttpMethod -eq 'OPTIONS') { $res.StatusCode = 204 }
    elseif ($req.HttpMethod -eq 'PUT' -and $p -match '^upload/([\w.-]+)$') {
      New-Item -ItemType Directory -Force $raw | Out-Null
      $fs = [IO.File]::Create((Join-Path $raw $Matches[1])); $req.InputStream.CopyTo($fs); $fs.Dispose()
      Write-Host "saved tools/raw/$($Matches[1])"; $res.StatusCode = 201
    } else {
      if (-not $p) { $p = 'index.html' }
      $f = [IO.Path]::GetFullPath((Join-Path $Root $p))
      if ($f.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path $f -PathType Leaf)) {
        $b = [IO.File]::ReadAllBytes($f); $res.ContentType = $types[[IO.Path]::GetExtension($f)] ?? 'application/octet-stream'
        $res.OutputStream.Write($b, 0, $b.Length)
      } else { $res.StatusCode = 404 }
    }
  } catch { $res.StatusCode = 500 } finally { $res.Close() }
}
