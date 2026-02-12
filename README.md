# All guns under 20 AZN

This project includes:

- A Node.js scraper that reads all gun pages from CSGOSKINS.GG JSON-LD.
- Automatic per-gun JSON output on every `npm run scrape`.
- Local image caching into `public/images/skins/` to avoid cross-origin image blocking on deploy.
- A compact static website that shows skins priced at or below 20 AZN.
- Click-to-preview modal for larger skin images.
- Mobile-friendly horizontal table scrolling.

## Run

1. Generate fresh data:

   npm run scrape

2. Start the website:

   npm start

3. Open:

   http://localhost:8080

## Output

The scraper writes filtered results to:

- public/data/all-guns-under-20-azn.json
- public/data/weapons/<weapon-slug>-under-20-azn.json (one file per gun)
- public/data/scar20-under-20-azn.json (legacy compatibility file)

## Notes

- Source index: https://csgoskins.gg/weapons
- Price source in JSON-LD is typically USD; the script converts USD -> AZN.
- FX source: frankfurter.app, with fallback rate 1.7 if FX fetch fails.
