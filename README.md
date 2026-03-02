# horse-weather-advice

Mobile-first PWA that provides horse blanket and pasture advice based on local weather (72h) using Open-Meteo.

Features
- Mobile-first, installable PWA (manifest + service worker)
- Uses device geolocation to fetch local Open‑Meteo forecast
- Interactive chart (temperature + precipitation) and summary table (day/night)
- Lightweight: static site served by nginx in Docker

Run locally (quick)
1. Build and run with docker-compose:

```bash
cd horse-weather-advice
docker compose up --build
# open http://localhost:8080 on your phone or emulator
```

2. Or run a quick static server locally (no Docker):

```bash
python3 -m http.server 8000 --directory .
# open http://localhost:8000
```

Development notes
- The main app entry is `index.html` and `main.js`.
- PWA manifest: `manifest.json`, service worker: `sw.js`.
- Charting uses Chart.js via CDN.

Repository structure
```
/ - index.html
  - main.js
  - styles.css
  - manifest.json
  - sw.js
  - Dockerfile
  - docker-compose.yml
  - nginx.conf
```

CI
- A GitHub Actions workflow is provided to run basic checks and build the Docker image.

Security
- Do not commit secrets. Use environment variables if you extend the app with server features.

License
- MIT
