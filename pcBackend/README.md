БУДУЩИЕ ДОБАВЛЕНИЯ (не в текущей структуре):

=== ПАРСИНГ ЦЕН (отдельный Python микросервис) ===
- scraper/ папка отдельно от основного бека
- scraper для немецких магазинов (Alternate, Mindfactory, Cyberport)
- scraper для Amazon DE
- scheduler (cron) для автообновления цен
- таблица price_history в БД (миграция 012)
- endpoint GET /api/prices/:componentType/:id/history

=== АВТОРИЗАЦИЯ (если решим добавить) ===
- auth.routes.js / auth.controller.js
- auth.middleware.js (JWT)
- auth.validator.js
- user.model.js
- миграция create_users
- сохранение сборок на аккаунт (сейчас только кеш/сессия)

=== ДОПОЛНИТЕЛЬНЫЕ ФИЧИ КОНФИГУРАТОРА ===
- фильтр по стране/магазину (немецкие цены vs общие)
- поддержка нескольких валют (EUR по дефолту)
- поиск по названию компонента (search endpoint)
- сравнение двух сборок между собой
- экспорт сборки (PDF или ссылка для шаринга)

=== ПРОИЗВОДИТЕЛЬНОСТЬ ===
- кеширование (Redis) для популярных запросов
- pagination для каталога компонентов (сейчас нет)
- индексы в БД (добавить в миграции позже)

=== АДМИНКА / КОНТЕНТ ===
- admin роуты для добавления/обновления компонентов
- валидация и загрузка фото компонентов
- управление совместимостями (exceptions таблица через API)



# pcBackend

REST API backend for a PC parts compatibility checker and build configurator.

## Stack

| Layer      | Technology                     |
|------------|--------------------------------|
| Server     | Node.js + Express              |
| Database   | MySQL + Knex (query builder)   |
| Validation | Zod                            |
| Logging    | Winston                        |
| Testing    | Jest + Supertest               |

## Prerequisites

- Node.js 18+
- MySQL 8+

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials

# 3. Create the database
mysql -u root -p -e "CREATE DATABASE pc_backend;"

# 4. Run migrations
npx knex migrate:latest

# 5. Seed test data
npx knex seed:run

# 6. Start
npm run dev       # development (nodemon)
npm start         # production
```

## API Reference

### Health

| Method | Endpoint       | Description    |
|--------|----------------|----------------|
| GET    | /api/health    | Server status  |

### Catalog

| Method | Endpoint             | Filters                               |
|--------|----------------------|---------------------------------------|
| GET    | /api/gpus            | `maxPrice`, `minVram`, `brand`        |
| GET    | /api/gpus/:id        | —                                     |
| GET    | /api/cpus            | `socket`, `maxPrice`, `brand`         |
| GET    | /api/cpus/:id        | —                                     |
| GET    | /api/mainboards      | `socket`, `formFactor`, `ramType`, `maxPrice` |
| GET    | /api/ram             | `ramType`, `minCapacity`, `maxPrice`  |
| GET    | /api/psus            | `minWattage`, `maxPrice`              |
| GET    | /api/cases           | `formFactor`, `maxPrice`              |
| GET    | /api/coolers         | `socket`, `type`, `maxPrice`          |
| GET    | /api/storage         | `type`, `minCapacity`, `maxPrice`     |
| GET    | /api/brands          | —                                     |

### Compatibility

```http
POST /api/compatibility
Content-Type: application/json

{
  "gpu_id": 2,
  "cpu_id": 1,
  "mainboard_id": 1,
  "ram_id": 1,
  "psu_id": 2,
  "case_id": 2,
  "cooler_id": 4
}
```

Response:
```json
{
  "success": true,
  "data": {
    "compatible": true,
    "issues": [],
    "warnings": ["GPU is PCIe 5.0, mainboard slot is PCIe 4.0..."]
  }
}
```

All fields optional — checks run only for provided components.

### Configurator

```http
POST /api/configurator
Content-Type: application/json

{
  "budget": 1500,
  "useCase": "gaming",
  "anchorComponents": {
    "gpu_id": 2
  }
}
```

`useCase`: `gaming` | `workstation` | `office` | `optimal`

`anchorComponents` — optional. Fixed components, budget distributed among the rest.

Response:
```json
{
  "success": true,
  "data": {
    "build": { "gpu": {...}, "cpu": {...}, "mainboard": {...}, ... },
    "totalPrice": 1263.00,
    "budgetTotal": 1500,
    "budgetSpentAnchors": 549.00,
    "compatible": true,
    "issues": [],
    "warnings": [],
    "anchoredComponents": ["gpu"]
  }
}
```

### Builds

```http
POST /api/builds          # Save a build, returns build_id (UUID)
GET  /api/builds/:id      # Get full build by build_id
```

### Bottleneck

```http
GET /api/bottleneck?gpu_id=2&cpu_id=1
```

Response:
```json
{
  "success": true,
  "data": {
    "ratio": 1.07,
    "verdict": "balanced",
    "resolution": null,
    "gpu": { "name": "GeForce RTX 4070 Ti Super", "benchmark_score": 23500 },
    "cpu": { "name": "Ryzen 5 7600", "benchmark_score": 22000 }
  }
}
```

`verdict`: `balanced` | `cpu_bottleneck` | `gpu_bottleneck`

## Budget Allocation by Use Case

| Component | gaming | workstation | office | optimal |
|-----------|--------|-------------|--------|---------|
| GPU       | 40%    | 20%         | —      | 35%     |
| CPU       | 20%    | 35%         | 30%    | 25%     |
| Mainboard | 15%    | 12%         | 20%    | 15%     |
| RAM       | 10%    | 25%         | 20%    | 10%     |
| PSU       | 8%     | 5%          | 10%    | 8%      |
| Case      | 4%     | 3%          | 5%     | 4%      |
| Cooler    | 3%     | —           | —      | 3%      |
| Storage   | —      | —           | 15%    | —       |

## Compatibility Checks

| Check        | Rule                                              |
|--------------|---------------------------------------------------|
| Socket       | `CPU.socket === MB.socket`                        |
| RAM type     | CPU and MB share at least one RAM type            |
| Power        | `GPU.tdp + CPU.tdp + 80 ≤ PSU.wattage`           |
| GPU fit      | `GPU.length_mm ≤ Case.max_gpu_length_mm`          |
| Form factor  | `MB.form_factor ∈ Case.supported_form_factors`    |
| Cooler       | Socket match + `Cooler.max_tdp ≥ CPU.tdp`        |
| PCIe         | `GPU.pcie > MB.pcie` → warning (not error)        |

## Running Tests

```bash
npm test                        # all tests
npm test -- --testPathPattern=unit        # unit only
npm test -- --testPathPattern=integration # integration only
```