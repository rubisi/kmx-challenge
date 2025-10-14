# KMX Coding Challenge

## Overview
This project implements a backend service that manages electric vehicle trip data.
It demonstrates RESTful API design, database normalization using Prisma ORM, and integration testing using Vitest + Testcontainers.

The system supports:
- CRUD operations for trip data
- Automatic CSV import
- Entity statistics
- Optional CSV export

## Tech Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Testing**: Vitest with Testcontainers
- **CSV Parsing**: Papa Parse
- **Package Manager**: pnpm

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- pnpm package manager
- Docker (for PostgreSQL and tests)


### Setup Instructions

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Database Setup**
   ```bash
   # Start PostgreSQL with Docker
   docker run --name kmx-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=kmx_challenge -p 5432:5432 -d postgres:15

   # Generate Prisma client
   pnpm prisma:generate

   # Run database migrations
   pnpm prisma:push
   ```

3. **Environment Configuration**
   Create a `.env` file in the project root with:
   ```
   DATABASE_URL="postgresql://postgres:password@localhost:5432/kmx_challenge"
   PORT=3000
   ```

### Available Commands
```bash
# Install dependencies from package.json
pnpm install

# Start the server
pnpm start:server

# Run the CSV importer script (data/input.csv)
pnpm start:import

# Run the test suite once
pnpm test

# Watch tests interactively
pnpm test:watch

# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Introspect your database in browser
pnpm prisma:studio

# Start PostgreSQL container (provided you ran that container already)
docker start kmx-postgres

# Stop PostgreSQL container
docker stop kmx-postgres

# Remove PostgreSQL container (if you need to start fresh)
docker rm kmx-postgres
```

## Database Schema (Entities) Overview
- Manufacturer (EV manufacturer e.g. BMW Group)
- VehicleModel (Model line e.g. iX3, Nexon EV)
- VehicleVariant (Battery/range variant of a model)
- Location (Origin/Destination city + country)
- Trip (**Main Entity** EV trip)

## API Documentation

This backend exposes RESTful endpoints for managing trip data and related entities.

### Trips

1. **`GET /trips`**: Retrieve records with default pagination (10 items per page)

Query parameters: `page`, `limit`

Response Example
```bash
{
  "data": [
    {
      "id": 1,
      "tripDate": "2025-02-10T00:00:00.000Z",
      "distanceKm": 5813,
      "vehicleVariant": {
        "batteryKwh": 80,
        "rangeKm": 463,
        "chargingType": "DC",
        "model": {
          "name": "iX3",
          "manufacturer": { "name": "BMW Group" }
        }
      },
      "origin": { "city": "New York", "country": "United States" },
      "destination": { "city": "Casablanca", "country": "Morocco" }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 25, "pages": 3 }
}
```

2. **`POST /trips`**: Create a new record from CSV data. Accept a single CSV row and parse it into multiple entities

Request Example
```bash
{
  "trip_date": "10/02/2025",
  "manufacturer": "BMW Group",
  "model": "iX3",
  "body_type": "Crossover",
  "segment": "Mid-size",
  "battery_kwh": 80,
  "range_km": 463,
  "charging_type": "DC",
  "price_eur": 70157,
  "origin_city": "New York",
  "origin_country": "United States",
  "destination_city": "Casablanca",
  "destination_country": "Morocco",
  "distance_km": 5813,
  "co2_g_per_km": 58,
  "grid_intensity_gco2_per_kwh": 350
}
```
Response Example
```bash
{
   "id": 1,
   "tripDate": "2025-02-10T00:00:00.000Z",
   "distanceKm": 5813,
   "co2_g_per_km": 58,
   "grid_intensity_gco2_per_kwh": 350
   "vehicleVariantId": 2,
   "originId": 3,
   "destinationId": 4
    "createdAt": "2025-10-13T21:52:44.240Z",
    "updatedAt": "2025-10-13T21:52:44.240Z"
}
```

3. **`PUT /trips/:id`**: Update the main entity and update related entities when they are directly modified

Request Example
```bash
{
  "trip_date": "13/10/2025",
  "manufacturer": "Tata Motors",
  "model": "Nexon EVV",
  "body_type": "Compact SUV",
  "segment": "Luxury",
  "battery_kwh": 40,
  "range_km": 224,
  "charging_type": "AC",
  "price_eur": 111873,
  "origin_city": "Singapore",
  "origin_country": "Singapore",
  "destination_city": "London",
  "destination_country": "United Kingdom",
  "distance_km": 10852,
  "co2_g_per_km": 55,
  "grid_intensity_gco2_per_kwh": 250
}
```
Response Example
```bash
{
    "id": 210,
    "tripDate": "2025-10-13T00:00:00.000Z",
    "distanceKm": 10852,
    "co2_g_per_km": 55,
    "grid_intensity_gco2_per_kwh": 250,
    "vehicleVariantId": 1183,
    "originId": 75,
    "destinationId": 76,
    "createdAt": "2025-10-13T20:29:45.722Z",
    "updatedAt": "2025-10-14T00:24:56.842Z",
}
```

4. **`DELETE /trips/:id`**: Remove the main entity record and clean up orphaned related entities

Response Example
```bash
{
    "ok": true
}
```
### Result

5. **`GET /result`**: Retrieve entity record counts

Response Example

```bash
{
  "manufacturers": 5,
  "models": 8,
  "variants": 12,
  "locations": 20,
  "trips": 40
}
```
### Import

6. **`POST /import`**: Bulk-imports trips from the provided CSV file (data/input.csv).

Triggered by the following importer script:

```bash
   # Run the CSV importer script (data/input.csv)
   pnpm start:import
```
Response Example

```bash
Import summary: ok=100, fail=0
Entity counts: {
  "manufacturers": 21,
  "models": 35,
  "variants": 100,
  "locations": 35,
  "trips": 100
}
```

### Export
7. **`POST /export`**: Generate and download a CSV file for any supported table
- **Request body**: JSON (see schema below)
- **Response**: text/csv; charset=utf-8 with Content-Disposition: attachment; filename="<table>-export.csv"

Supported tables: `trips`, `manufacturers`, `vehicleModels`, `vehicleVariants`, `locations`

Field presets (defaults + allowlist):
- **`trips`**: `id`, `tripDate`, `distanceKm`, `co2_g_per_km`, `grid_intensity_gco2_per_kwh`, `vehicleVariantId`, `originId`, `destinationId`, `createdAt`, `updatedAt`
- **`manufacturers`**: `id`, `name`, `createdAt`, `updatedAt`
- **`vehicleModels`**: `id`, `manufacturerId`, `name`, `bodyType`, `segment`, `createdAt`, `updatedAt`
- **`vehicleVariants`**: `id`, `modelId`, `batteryKwh`, `rangeKm`, `chargingType`, `priceEur`, `createdAt`, `updatedAt`
- **`locations`**: `id`, `city`, `country`, `createdAt`, `updatedAt`

Request body schema:
```bash
{
  "table": "trips | manufacturers | vehicleModels | vehicleVariants | locations",
  "fields": ["optional", "list", "of", "valid", "fields"],
  "limit": 1000,
  "order": "asc | desc",
  "filters": {
    "date_from": "YYYY-MM-DD or DD/MM/YYYY",
    "date_to": "YYYY-MM-DD or DD/MM/YYYY",
    "manufacturer": "partial match (case-insensitive)",
    "model": "partial match (case-insensitive)",
    "origin_country": "partial match (case-insensitive)",
    "destination_country": "partial match (case-insensitive)"
  }
}

> **Note:** Filters are **only supported for `trips`**. Other tables ignore `filters`.

```
Examples:
```bash
# Export trips with filters
curl -X POST "http://localhost:3000/export" \
  -H "Content-Type: application/json" \
  -d '{
    "table": "trips",
    "fields": ["id","tripDate","distanceKm","originId","destinationId"],
    "limit": 1000,
    "order": "desc",
    "filters": {
      "date_from": "2025-01-01",
      "date_to": "2025-12-31",
      "manufacturer": "BMW",
      "origin_country": "United States"
    }
  }' -o trips-export.csv

# Export manufacturers (no filters)
curl -X POST "http://localhost:3000/export" \
  -H "Content-Type: application/json" \
  -d '{ "table": "manufacturers", "order": "asc", "limit": 200 }' \
  -o manufacturers.csv
```
Response Example:
- Content-Type: text/csv
- Returns a downloadable CSV file

## Design Decisions & Assumptions

This section outlines key implementation choices and assumptions made during development.

### Main Entity
- The **main entity** in the system is `Trip`.
- Each trip connects two `Location` entities (origin and destination) and references one `VehicleVariant`, which itself is linked to a `VehicleModel` and a `Manufacturer`.

### Database Normalization
- All categorical attributes (e.g., manufacturer, model, location) are stored in separate normalized tables
- Relations:
   - `Manufacturer` -> `VehicleModel` -> `VehicleVariant`
   - `Trip` -> (`Origin` + `Destination` as `Location`)

### Importer Design
- The importer (`src/import/index.ts`) reads data/input.csv line-by-line using Papa Parse.
- For each row:
   - Converts it to a TripCreateDTO.
   - Sends it to POST /trips.
- Ensures:
   - Consistency with API logic.
   - Idempotency (duplicates return existing records).
   - Error tolerance for invalid rows.

### Idempotency & Cleanup
- When the same trip data is sent multiple times, the backend returns the existing record instead of creating a duplicate.
- Shared entities (e.g., manufacturer, locations) are reused across trips.
- Deletion (DELETE /trips/:id) removes only orphaned records, preserving shared relationships.

### Testing Strategy
- Tests use Vitest with Testcontainers to spin up ephemeral PostgreSQL instances.
- Each test:
   1. Starts a fresh Postgres container.
   2. Pushes the Prisma schema (`npx prisma db push --force-reset`).
   3. Runs CRUD and importer tests.
   4. Tears down the container cleanly.
- No persistent or local database setup is required.
- Coverage includes:
   - CRUD endpoints (`/trips`)
   - Statistics endpoint (`/result`)
   - Import functionality (`/import`)

### Assumptions
- Input CSV has clean, consistent data (no missing columns).
- All date fields are provided as either `DD/MM/YYYY` or `YYYY-MM-DD`.
- The importer and API run locally on the same machine (default `http://localhost:3000`).
- Postgres credentials match those in the `.env` file.
- No frontend or authentication layer was required per the challenge scope.

## Testing
Run the complete integration test suite:
```bash
pnpm test
```
