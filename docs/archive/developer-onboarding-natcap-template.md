# Developer Onboarding Guide

**NatCap Listings** -- Australian rural property listing pipeline.

This guide walks you through setting up a local development environment, running the pipeline, and understanding the codebase. It assumes you are joining the NatCap team and need to contribute to this project.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Setup](#2-clone-and-setup)
3. [Local Database](#3-local-database)
4. [Environment Configuration](#4-environment-configuration)
5. [Running the Pipeline Locally](#5-running-the-pipeline-locally)
6. [Running Tests](#6-running-tests)
7. [Code Quality](#7-code-quality)
8. [Project Structure](#8-project-structure)
9. [Key Conventions](#9-key-conventions)

---

## 1. Prerequisites

You need the following tools installed before you begin.

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Runtime |
| UV | latest | Package manager (replaces pip/poetry) |
| Docker | latest | PostGIS container for integration tests |
| 1Password CLI (`op`) | latest | Secrets injection for local dev |
| PostgreSQL client (`psql`) | 15+ | Optional, for manual DB inspection |
| Git | latest | Version control (SSH remotes only) |
| Cloud SQL Auth Proxy | latest | Optional, for connecting to production CloudSQL |

### Installing prerequisites (macOS with MacPorts)

```bash
# Python 3.11+ (if not already installed)
sudo port install python311

# UV package manager
curl -LsSf https://astral.sh/uv/install.sh | sh

# Docker Desktop (download from docker.com or use MacPorts)
# Ensure Docker is running before integration tests

# 1Password CLI
sudo port install 1password-cli
# Or download from: https://developer.1password.com/docs/cli/get-started/

# PostgreSQL client (optional)
sudo port install postgresql15
```

### 1Password access

You need access to the **MullionGroup** 1Password organization (`mulliongroup.1password.com`) with access to the **Systems** vault. The following items contain the secrets used by this project:

| 1Password Item | Field | Environment Variable |
|----------------|-------|---------------------|
| `natcap-db` | `password` | `NATCAP_DB__PASSWORD` |
| `natcap-scrapfly` | `api-key` | `NATCAP_SCRAPFLY__API_KEY` |
| `natcap-geocoding` | `api-key` | `NATCAP_GEOCODING__API_KEY` |

Sign in to 1Password CLI before running the pipeline:

```bash
op signin
```

---

## 2. Clone and Setup

### Clone the repository

Always use SSH for git remotes, never HTTPS:

```bash
git clone git@github.com:MullionGroup/natcap-listings.git
cd natcap-listings
```

If you find the remote is using HTTPS, convert it:

```bash
git remote set-url origin git@github.com:MullionGroup/natcap-listings.git
```

### Install dependencies

```bash
uv sync
```

This installs all runtime and dev dependencies into a virtual environment managed by UV. The `uv.lock` file ensures reproducible installs.

### Verify installation

```bash
uv run natcap-listings --help
```

You should see the CLI help output listing commands: `run`, `status`, `migrate`, `parse`, `geocode`, `match`, `sold`, `diagnose`, `report`.

---

## 3. Local Database

There are two database contexts you need to understand:

1. **Test database** -- A Docker PostGIS container used by integration tests. Ephemeral, no real data.
2. **Development database** -- The production CloudSQL instance (`natcap_spatial_v2`) accessed via Cloud SQL Auth Proxy. Contains real Geoscape reference data.

### Test database (Docker)

The test database is defined in `docker-compose.test.yml` and uses the `imresamu/postgis:17-3.5-alpine` image.

**Start manually:**

```bash
docker compose -f docker-compose.test.yml up -d
```

**Connection details:**

| Parameter | Value |
|-----------|-------|
| Host | `127.0.0.1` |
| Port | `15432` |
| Database | `test_natcap` |
| User | `test_user` |
| Password | `test_password` |

**Connect with psql:**

```bash
psql postgresql://test_user:test_password@localhost:15432/test_natcap
```

The container auto-initializes by mounting SQL files from `tests/fixtures/sql/` and `sql/`:

- `00_test_roles.sql` -- Test user roles
- `001_schema.sql` -- Full `listings` schema DDL
- `01_au_postcodes.sql` -- Australian postcode reference data
- `02_reference_schema.sql` -- Geoscape reference schema (test subset)
- `03_seed_data.sql` -- Seed data for tests

The container uses `tmpfs` for data storage, so data does not persist across restarts.

**Tear down:**

```bash
docker compose -f docker-compose.test.yml down -v
```

### Development database (CloudSQL)

For development against real data, connect to the production CloudSQL instance through the Cloud SQL Auth Proxy:

```bash
# Start the proxy (runs in background)
cloud-sql-proxy dash-wollemi:australia-southeast1:wollemi-db &

# The proxy listens on localhost:5432 by default
```

The database name is `natcap_spatial_v2`. It contains two schemas:

- **`listings`** -- Our tables (read/write). Scrape runs, properties, parsed addresses, geocoding cache, property matches.
- **`reference`** -- Geoscape property data (read-only). ~1.9M property boundaries, ~2.7M cadastral parcels, ~1.5M addresses.

> **Important:** The `reference` schema is read-only. Never attempt to write to it. All Geoscape data is loaded separately by the GIS team.

---

## 4. Environment Configuration

Configuration uses [Pydantic Settings](https://docs.pydantic-dev.com/latest/concepts/pydantic_settings/) with the `NATCAP_` prefix. Nested settings use double-underscore (`__`) as a delimiter.

### The .env.tpl file

The file `.env.tpl` is the environment template. It contains 1Password references (`op://...`) that the `op run` command resolves at runtime:

```bash
# .env.tpl -- 1Password references for local dev
NATCAP_ENVIRONMENT=development
NATCAP_LOG_LEVEL=INFO
NATCAP_GCP_PROJECT=dash-natcap

# Database
NATCAP_DB__HOST=localhost
NATCAP_DB__PORT=5432
NATCAP_DB__NAME=natcap_spatial_v2
NATCAP_DB__USER=natcap
NATCAP_DB__PASSWORD=op://Systems/natcap-db/password

# ScrapFly API
NATCAP_SCRAPFLY__API_KEY=op://Systems/natcap-scrapfly/api-key

# Google Geocoding API
NATCAP_GEOCODING__API_KEY=op://Systems/natcap-geocoding/api-key
NATCAP_GEOCODING__MAX_BATCH_SIZE=1000

# Pipeline
NATCAP_PIPELINE__DRY_RUN=false
```

### The .env.direct.tpl file

For direct TCP connections (bypassing Cloud SQL Auth Proxy), use `.env.direct.tpl`. This connects directly to the CloudSQL public IP (`35.197.171.116`) and is faster for spatial queries. Requires your IP to be in the CloudSQL authorized networks.

```bash
op run --account=mulliongroup.1password.com --env-file=.env.direct.tpl -- uv run natcap-listings status
```

### Configuration hierarchy

The `Settings` class in `src/natcap_listings/config.py` is the root configuration model:

```mermaid
graph TD
    Settings["<b>Settings</b><br/>(BaseSettings, env_prefix=NATCAP_)<br/>environment: str<br/>log_level: str<br/>gcp_project: str"]
    DB["<b>db: DatabaseSettings</b><br/>(BaseModel)<br/>host, port, name, user<br/>password (SecretStr)<br/>pool_size, max_overflow, pool_recycle"]
    SF["<b>scrapfly: ScrapFlySettings</b><br/>(BaseModel)<br/>api_key (SecretStr)<br/>max_concurrency, timeout"]
    GC["<b>geocoding: GeocodingSettings</b><br/>(BaseModel)<br/>api_key (SecretStr)<br/>requests_per_second, max_batch_size"]
    SC["<b>scraping: ScrapingSettings</b><br/>(BaseModel)<br/>max_pages (default 5)<br/>sources (list)"]
    PL["<b>pipeline: PipelineSettings</b><br/>(BaseModel)<br/>states, property_types<br/>parsing_confidence_threshold<br/>match_distance_threshold (default 2000m)<br/>dry_run"]

    Settings --> DB
    Settings --> SF
    Settings --> GC
    Settings --> SC
    Settings --> PL
```

> **Important design note:** Only the root `Settings` class extends `BaseSettings`. All nested config classes extend `BaseModel` (not `BaseSettings`). This is required for `env_nested_delimiter` to work correctly with Pydantic Settings.

### How secrets work

- **Local dev:** Secrets are stored in 1Password. The `.env.tpl` file uses `op://` references. Run commands with `op run --env-file=.env.tpl --` to inject real values.
- **Production:** Secrets come from GCP Secret Manager, mounted as environment variables on the Cloud Run Job.
- **Tests:** No secrets needed. The test database uses hardcoded credentials and API keys are mocked.

### Manual .env file (alternative)

If you prefer not to use 1Password, create a `.env` file (git-ignored) with real values:

```bash
NATCAP_DB__PASSWORD=your_actual_password
NATCAP_SCRAPFLY__API_KEY=your_actual_key
NATCAP_GEOCODING__API_KEY=your_actual_key
```

Pydantic Settings reads `.env` files natively (configured in `SettingsConfigDict`).

---

## 5. Running the Pipeline Locally

### Full pipeline with 1Password

```bash
op run --env-file=.env.tpl -- uv run natcap-listings run
```

This executes all six stages: SCRAPE -> LOAD -> PARSE -> GEOCODE -> MATCH -> SNAPSHOT.

### Dry run (no database writes)

```bash
op run --env-file=.env.tpl -- uv run natcap-listings run --dry-run
```

### Scrape specific sources

```bash
op run --env-file=.env.tpl -- uv run natcap-listings run --sources realestate,domain
```

Valid source names: `realestate`, `domain`, `farmbuy`, `farmproperty`, `commercialrealestate`.

### Limit pages scraped

```bash
# Only scrape 2 pages per source (quick test)
op run --env-file=.env.tpl -- uv run natcap-listings run --max-pages 2

# Full scrape (80 pages per source, used on Sundays)
op run --env-file=.env.tpl -- uv run natcap-listings run --full
```

### Run individual stages

```bash
# Parse addresses only (no scraping, no geocoding)
op run --env-file=.env.tpl -- uv run natcap-listings parse

# Geocode only (uses cache first, then Google API)
op run --env-file=.env.tpl -- uv run natcap-listings geocode

# Spatial match only (PostGIS against Geoscape)
op run --env-file=.env.tpl -- uv run natcap-listings match
```

### Check database status

```bash
op run --env-file=.env.tpl -- uv run natcap-listings status
```

### Run Alembic migrations

```bash
op run --env-file=.env.tpl -- uv run natcap-listings migrate
```

---

## 6. Running Tests

The test suite is organized into three tiers based on what infrastructure they require.

### Unit tests (default, no Docker needed)

```bash
uv run pytest
```

By default (`addopts` in `pyproject.toml`), this runs tests marked as neither `integration` nor `live`. These tests use mocks and fixtures -- no database or API access required.

The default pytest flags include coverage reporting:

```
-v --tb=short --cov=natcap_listings --cov-report=term-missing -m 'not live and not integration'
```

### Integration tests (require Docker PostGIS)

These tests require a running PostGIS container. The `pytest-docker` plugin manages the container lifecycle automatically.

```bash
# Run integration tests (starts Docker container automatically)
uv run pytest -m integration

# Or start the container first for faster iteration:
docker compose -f docker-compose.test.yml up -d
uv run pytest -m integration

# Keep the container running after tests for manual inspection:
uv run pytest -m integration --keep-db
```

**Integration test fixtures** (defined in `tests/conftest_db.py`):

| Fixture | Scope | Purpose |
|---------|-------|---------|
| `db_engine` | session | SQLAlchemy engine connected to Docker PostGIS |
| `db_session` | function | Session that rolls back after each test (clean slate) |
| `db_committed_session` | function | Session that commits (use sparingly) |
| `db_session_factory` | session | `sessionmaker` bound to test engine |

The `db_session` fixture uses `session.begin_nested()` (savepoints) so each test gets a clean database without re-creating the schema. Prefer `db_session` over `db_committed_session` unless you specifically need committed data visible to other connections.

### Live tests (require real API keys)

Live tests hit real external APIs (ScrapFly, Google Geocoding). They are expensive and slow.

```bash
# Requires SCRAPFLY_KEY env var
uv run pytest -m live
```

These are primarily smoke tests to verify scraper parsing logic against real website responses.

### Running all tests

```bash
uv run pytest -m ""
```

### Test environment isolation

The `conftest.py` fixture `_clean_env` (autouse) removes all `NATCAP_` environment variables before each test, preventing test pollution from your local `.env` file.

### Debugging tests

```bash
# Show SQL queries during integration tests
SQL_ECHO=1 uv run pytest -m integration -k test_name

# Run a single test with verbose output
uv run pytest tests/test_config.py::test_settings_defaults -vvs
```

---

## 7. Code Quality

### Linting

```bash
uv run ruff check src/ tests/
```

Ruff is configured in `pyproject.toml` with these rule sets:

- **E** -- pycodestyle errors
- **F** -- pyflakes
- **I** -- isort (import ordering)
- **N** -- pep8-naming
- **W** -- pycodestyle warnings
- **UP** -- pyupgrade (modern Python syntax)

Line length is set to **100 characters**.

### Formatting

```bash
uv run ruff format src/ tests/
```

### Type checking

```bash
uv run mypy src/
```

MyPy is configured with `strict = true` and the `pydantic.mypy` plugin.

### Pre-commit workflow

Before submitting changes, run all three:

```bash
uv run ruff check src/ tests/ && uv run ruff format --check src/ tests/ && uv run pytest
```

---

## 8. Project Structure

```
natcap-listings/
  src/natcap_listings/           # Main package
    __init__.py
    __main__.py                  # python -m natcap_listings entry point
    cli.py                       # Click CLI: run, status, migrate, parse, geocode, match, sold, diagnose, report
    config.py                    # Pydantic Settings (NATCAP_ prefix, nested via __)
    pipeline.py                  # Orchestrator: SCRAPE -> LOAD -> PARSE -> GEOCODE -> MATCH -> SNAPSHOT
    logging.py                   # structlog + rich logging setup

    db/                          # Database layer
      engine.py                  # SQLAlchemy engine factory, session management
      models.py                  # All ORM models (listings schema) + Python enums

    scraping/                    # Web scraping (5 sites)
      base.py                   # BaseScraper ABC + RawListing Pydantic model
      realestate.py             # realestate.com.au (ArgonautExchange JSON)
      domain.py                 # domain.com.au (Argonaut JSON, has lat/lng)
      farmbuy.py                # farmbuy.com (JSON + CSS fallback)
      farmproperty.py           # farmproperty.com.au (JS rendering, KnockoutJS)
      commercial.py             # commercialrealestate.com.au (JS rendering, Redux)
      loader.py                 # Validate RawListings + upsert into properties table
      price_parser.py           # Price text extraction utilities

    parsing/                     # Address parsing
      parser.py                 # Structured address parsing (ported from wollemi)
      constants.py              # Street types, state codes, regex patterns
      stage.py                  # parse_pending() -- process unmatched addresses

    geocoding/                   # Google Geocoding API
      client.py                 # API wrapper with rate limiting
      processor.py              # Batch geocoding with cache-first logic

    matching/                    # Geoscape property matching
      geoscape.py               # PostGIS spatial: ST_Contains + ST_DWithin

    diagnostics/                 # Pipeline health monitoring
      snapshot.py               # Diagnostic snapshot capture
      report.py                 # Reporting with trend comparison

  deployment/                   # Cloud Run Job deployment
    deploy.sh                   # Build, push, deploy script
    natcap-job-config.yaml.template  # Job config with 1Password refs

  tests/                        # Test suite
    conftest.py                 # Shared fixtures (env cleanup)
    conftest_db.py              # Docker PostGIS fixtures (db_engine, db_session)
    fixtures/sql/               # SQL seed files for test DB

  scripts/                      # One-time operational scripts
    migrate_from_duckdb.py      # Import old DuckDB data into PostgreSQL
    backfill_geocoding.py       # Import geocoding cache from old system

  sql/                          # Schema DDL
    001_schema.sql              # Full listings schema (tables, types, indexes, views)

  docs/                         # Documentation
    init/INIT.md                # Original requirements
    review/WOLLEMI_REVIEW.md    # Legacy system review
    plan/IMPLEMENTATION_PLAN.md # 7-phase implementation plan
    database/                   # Schema design, models, migration scripts
    guides/                     # This guide and operations guide
    api/                        # CLI reference

  .env.tpl                      # 1Password env template
  pyproject.toml                # Project config (deps, ruff, pytest, mypy)
  docker-compose.test.yml       # PostGIS for integration tests
```

### Module responsibilities

| Module | What it does |
|--------|-------------|
| `cli.py` | Defines Click commands. Parses CLI options, loads settings, delegates to `pipeline.py`. |
| `config.py` | Pydantic Settings model. Reads `NATCAP_*` env vars. No business logic. |
| `pipeline.py` | Orchestrator. Calls each stage in order. Manages the ScrapFly client and database engine lifecycle. |
| `db/engine.py` | Creates SQLAlchemy `Engine` and provides `get_session()` context manager. Handles connection pooling. |
| `db/models.py` | All ORM models for the `listings` schema. Defines Python enums matching PostgreSQL ENUM types. |
| `scraping/base.py` | `BaseScraper` ABC that all five scrapers extend. Defines `RawListing` (flat Pydantic model). Handles retries, throttling, and batch sleep. |
| `scraping/loader.py` | Takes `list[RawListing]`, validates, and upserts into `listings.properties`. Detects field-level changes and records them in `listing_changes`. |
| `parsing/parser.py` | Extracts structured address components (street, suburb, state, postcode) from raw address text. |
| `geocoding/processor.py` | Checks `geocoding_cache` first, calls Google API only for misses. Writes results to `geocoding_cache` and links via `listing_geocodes`. |
| `matching/geoscape.py` | Runs PostGIS queries against `reference.geoscape_properties`. First tries `ST_Contains` (point-in-polygon), falls back to `ST_DWithin` (nearest within threshold). |

---

## 9. Key Conventions

### Composite primary keys

Properties are identified by `(listing_id, source)` -- not a surrogate key. The `listing_id` is the ID from the source website (e.g., realestate.com.au listing number). The `source` is a `PropertySource` enum value.

### StrEnum with values_callable

Python `StrEnum` values are lowercase (`realestate`, `domain`, etc.) but SQLAlchemy `Enum` sends `.name` (UPPERCASE) by default. All `SAEnum` definitions in `models.py` must include:

```python
SAEnum(PropertySource, values_callable=lambda cls: [e.value for e in cls], ...)
```

Without this, PostgreSQL receives `REALESTATE` instead of `realestate` and raises a type error.

### WKBElement for geometry

PostGIS geometry columns return `WKBElement` objects (from GeoAlchemy2), not raw `bytes`. When working with geometry data in Python, use GeoAlchemy2 functions for spatial operations rather than trying to decode WKB manually.

### Synchronous pipeline

The entire pipeline is synchronous. No `async`/`await`, no concurrent API calls. This is intentional:

- ScrapFly rate limits require controlled pacing (batch sleep every 2 pages, 30-second pauses).
- Geocoding has a configurable `requests_per_second` limit.
- The pipeline runs as a Cloud Run Job (batch), not a web service. Throughput is not a concern.

### Immutable geocoding cache

The `geocoding_cache` table is append-only. Never DELETE rows. To invalidate a cache entry, set `is_valid = false`. This preserves audit history and prevents re-geocoding addresses that have already been resolved.

### Change tracking

Every field-level change to a property listing is recorded in `listing_changes`. When the loader upserts a property, it compares each field against the existing row and writes a change record for every difference. The `listing_changes` table is partitioned monthly to keep query performance manageable.

### No .env file in git

The `.env` file is git-ignored. Use `.env.tpl` with `op run` for local development. Never commit real secrets.

### SRID handling

Geoscape data uses SRID 7844 (GDA2020). Google Geocoding returns SRID 4326 (WGS84). The difference is ~1-2 meters in Australia, but the matching queries always use `ST_Transform` for correctness:

```sql
ST_Transform(ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), 7844)
```

---

## Next Steps

After completing setup:

1. Run `uv run pytest` to verify everything works.
2. Read the [CLI Reference](../api/CLI_REFERENCE.md) for command details.
3. Read the [Operations Guide](OPERATIONS.md) for production context.
4. Review `docs/plan/IMPLEMENTATION_PLAN.md` for the full 7-phase plan and current status.
5. Check the `docs/database/` directory for schema design documentation.
