# Stronghold Viewer

Minecraft 1.16.1 stronghold layout viewer with Three.js. Generation runs in the browser via [CheerpJ](https://cheerpj.com/) using a single uber-jar built from `StrongholdViewerMain.java` and the KaptainWutax libs (same stack as [zero-tracker](https://github.com/dev-boyenn/zero-tracker)).

Deploys as **static files on Vercel** — no server required.

## Local development

Open `index.html` with any static server, or use Flask for local-only API testing:

```bat
py -3 -m http.server 8000
```

Then open http://127.0.0.1:8000

## Rebuild the CheerpJ jar (after Java changes)

```bat
tools\stronghold_generator\setup_libs.ps1
tools\stronghold_generator\build_jar.bat
```

Output: `app/stronghold-viewer.jar` (commit this for Vercel deploys).

## Vercel

Static deploy — point Vercel at the repo root. No `vercel.json` required unless you want custom routes. The viewer loads:

- `index.html`
- `app/stronghold-viewer.jar` (CheerpJ virtual path `/app/stronghold-viewer.jar`)
- `pathfinder.js`, `get_mpk_stronghold.js`, etc.

## Optional: Flask backend (local / self-hosted)

For faster generation without CheerpJ startup cost:

```bat
run_app.bat
```

Uses `stronghold_service.py` to call native Java instead of the browser runtime.

## Architecture

| Mode | Where Java runs | Hosting |
|------|-------------------|---------|
| **CheerpJ (default)** | User's browser | Vercel / any static host |
| **Flask (optional)** | Your server | Railway, Render, local |

`StrongholdViewerMain` commands (both modes):

- `locations <seed>` — first-ring stronghold chunk positions
- `generate <seed> <chunkX> <chunkZ>` — full piece JSON for the viewer
