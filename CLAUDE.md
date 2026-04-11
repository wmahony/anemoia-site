# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local Dev Server

Served via Node.js inline HTTP server on port 3457:

```bash
/opt/homebrew/bin/node -e "const h=require('http'),fs=require('fs'),p=require('path');h.createServer((q,r)=>{let f=p.join('/Users/wmahony/Downloads/anemoia-site',q.url==='/'?'index.html':q.url);try{const d=fs.readFileSync(f);const m={'html':'text/html','js':'text/javascript','css':'text/css','jpg':'image/jpeg','png':'image/png','glb':'model/gltf-binary'};r.writeHead(200,{'Content-Type':m[f.split('.').pop()]||'application/octet-stream'});r.end(d)}catch(e){r.writeHead(404);r.end('Not found')}}).listen(3457,()=>console.log('Serving on 3457'))"
```

Open at: http://localhost:3457

Use `preview_start "Anemoia — Site"` in Claude Code to launch.

## Project Structure

Single-file static site — all HTML, CSS, and JavaScript lives in `index.html`. No build step, no framework, no dependencies, no package.json.

## Architecture

**`index.html`** contains:

1. **Tunnel hero** — 3000vh scroll section with sticky canvas. A fixed-size portal circle (logoR = 26% of min viewport) clips a looping concentric-ring tunnel animation. Scroll drives speed; the tunnel also auto-advances at idle.
2. **Content sections** — About, Founder, Artists — below the tunnel, black background, Archivo Black / Montserrat.
3. **Fixed right-side nav** — About, Founder, Artists links. Lenis smooth-scrolls to each section.
4. **Footer** — Instagram, LinkedIn, TikTok, © 2026.

**Canvas tunnel logic** (`drawTunnel(tunnelT)`):
- 64 rings drawn with `ctx.arc()` inside a clipped circle
- Depth mapping: `Math.pow(rawT, 2.6)` — rings compress toward center like the real logo
- `tunnelOffset` cycles 0→1 continuously via `(tunnelOffset + speed * dt) % 1`
- Auto-advance: `0.000015 * dt` baseline + scroll boost up to `0.00035 * dt`

## Fonts & Palette

- **Archivo Black** — wordmark, headings
- **Montserrat** (300/400/500) — body, nav, labels
- Black background `#000`, white text `#fff`, muted white at various opacities

## Remote

```
origin  https://github.com/wmahony/anemoia-website.git (main)
```
