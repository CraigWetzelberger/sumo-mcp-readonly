# sumo-mcp-readonly

A read-only MCP server for querying Sumo Logic logs via the Search Job API.

## Project Status

Complete and working. All 5 tools functional, 68 unit tests passing.

## Tech Stack

- TypeScript, Node.js 20+, ESM
- MCP SDK (`@modelcontextprotocol/sdk`)
- Zod for input validation
- Vitest for tests
- stdio transport

## Key Architecture Decisions

- Timestamps sent as epoch milliseconds (not ISO-8601) to the Sumo API — Sumo rejects ISO format with milliseconds
- Cookies must be maintained per job session (Sumo requirement)
- In-memory job registry tracks jobs created by this process — only owned jobs can be queried/cancelled
- All logs to stderr (stdout reserved for MCP JSON-RPC protocol)
- Credentials never logged — redaction applied before any error output

## MCP Tools

1. `sumo_search_logs` — Run arbitrary Sumo queries
2. `sumo_find_errors` — Opinionated error search (ERROR, exception, failure, fatal, stack traces)
3. `sumo_search_correlation_id` — Search for a trace/request/correlation ID
4. `sumo_get_search_status` — Poll a running search job
5. `sumo_cancel_search` — Cancel a running search job

## Configuration

Environment variables loaded via `--env-file=.env` in npm start, or passed via MCP client config `env` block.

Required:
- `SUMO_ACCESS_ID`
- `SUMO_ACCESS_KEY`
- `SUMO_API_BASE_URL` — Regional API endpoint (see README for full list)

## Sumo Logic API Reference

- `POST /v1/search/jobs` — Create job (body: `{ query, from, to, timeZone }`)
- `GET /v1/search/jobs/{id}` — Poll status
- `GET /v1/search/jobs/{id}/messages?offset=X&limit=Y` — Get messages
- `GET /v1/search/jobs/{id}/records?offset=X&limit=Y` — Get records
- `DELETE /v1/search/jobs/{id}` — Cancel/delete job
- Auth: HTTP Basic (AccessID:AccessKey)
- Rate limit: 4 req/s, 200 concurrent jobs per org

## Build & Test

```bash
npm install
npm run build    # TypeScript compile
npm test         # Unit tests
npm run lint     # ESLint
npm start        # Requires .env file
```

## Project Structure

```
src/
  index.ts            — Entry point: config validation, server startup, shutdown
  server.ts           — MCP server creation and tool registration
  config.ts           — Environment variable validation with Zod
  logging.ts          — Structured JSON logger (stderr only)
  sumo/
    client.ts         — HTTP client with auth, cookies, error mapping
    auth.ts           — HTTP Basic authentication
    types.ts          — Sumo Logic API type definitions
    search-jobs.ts    — Search lifecycle orchestration
    errors.ts         — Typed error hierarchy
  tools/
    search-logs.ts    — sumo_search_logs tool
    find-errors.ts    — sumo_find_errors tool
    search-correlation-id.ts — sumo_search_correlation_id tool
    get-search-status.ts     — sumo_get_search_status tool
    cancel-search.ts         — sumo_cancel_search tool
  query/
    escaping.ts       — Query literal escaping
    builders.ts       — Opinionated query construction
  security/
    redaction.ts      — Credential redaction
    limits.ts         — Time range and result limit enforcement
```
