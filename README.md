# RigStacker

RigStacker is a full-stack PC build configurator that generates compatible PC builds based on budget, use case, component anchors, and live market pricing.

The project includes a React frontend, Node.js backend, MySQL database, Redis cache, and Python-based price scrapers.

## Features

- PC build generation by budget and use case
- Gaming / Workstation / Office / Optimal build profiles
- Component anchoring for user-owned parts
- Compatibility checks
- Bottleneck analysis
- Build Health analysis: power, cooling, fit, storage
- New / Best Value pricing modes
- Product deal links
- Saved builds with shareable URLs
- Builds library
- Build comparison
- Dark / Light theme
- Redis caching for catalog, recommendations, and saved builds
- Python scrapers for market price collection

## Tech Stack

### Frontend
- React
- Vite
- CSS variables / theme tokens

### Backend
- Node.js
- Express
- MySQL
- Redis
- Knex migrations

### Scraper
- Python
- BeautifulSoup
- Requests
- MySQL connector

## Project Structure

```text
rigstacker/
  pcBackend/     Node.js API backend
  pcFrontend/    React frontend
  scraper/       Python price scrapers
