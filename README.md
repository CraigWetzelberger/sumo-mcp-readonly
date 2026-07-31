# sumo-mcp-readonly

A read-only [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for querying [Sumo Logic](https://www.sumologic.com/) logs. Enables AI-powered coding assistants to search and investigate application logs directly from your editor.

Works with any MCP-compatible client: [Kiro](https://kiro.dev), [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview), [Cursor](https://cursor.sh), VS Code + Copilot, and others.

## Why This Project?

As of now July 31, 2026 - Sumo Logic has announced an MCP server as part of their Dojo AI platform (limited beta, focused on security operations), but there is no publicly available, standalone MCP server for general log search. Community options exist but tend to be minimal wrappers around the search API without attention to:

- **Credential safety** — this server redacts access keys from all error output and never logs credentials
- **Cookie handling** — Sumo's Search Job API requires cookies to be maintained per session; most implementations miss this and get intermittent failures
- **Timestamp format** — Sumo rejects ISO-8601 timestamps with milliseconds; this server sends epoch milliseconds correctly
- **Job isolation** — only search jobs created by this process can be queried or cancelled, preventing cross-session leakage
- **Opinionated tools** — `sumo_find_errors` and `sumo_search_correlation_id` encode common investigation patterns so your AI assistant doesn't need to know Sumo query syntax to be useful

If one of the community servers covers your needs, use it. This one prioritizes correctness and security for production use.

## Quick Start

### Prerequisites

- Node.js 20 or later
- A Sumo Logic account with an Access Key

### Install Node.js

**macOS** (Homebrew):

```bash
brew install node@20
```

Or download from https://nodejs.org (LTS version).

**Windows**:

Option A — Download the installer from https://nodejs.org (LTS version). Run it and accept defaults.

Option B — Using winget:

```powershell
winget install OpenJS.NodeJS.LTS
```

Option C — Using [nvm-windows](https://github.com/coreybutler/nvm-windows):

```powershell
nvm install 20
nvm use 20
```

After installing, open a new terminal and verify:

```bash
node --version   # Should show v20.x.x or later
npm --version    # Should show 10.x or later
```

**Linux** (Ubuntu/Debian):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 1. Create your Sumo Logic Access Key

1. Log into Sumo Logic
2. Click your username (bottom-left) and select **Personal Access Keys** ([docs](https://www.sumologic.com/help/docs/manage/security/access-keys/))
3. Click **+ Add Access Key**
4. Name it something like "MCP Server"

Access keys can be scoped to limit permissions. When creating the key, select **Custom** scopes and enable only **Log Search** — that's the single scope this server needs. No other permissions are required.

The user creating the key must have a role with:
- A search filter that allows access to the log data you want to query

The built-in **Analyst** role works. If you want a minimal custom role, grant `View Collectors`, set the search filter to allow the source categories you need, and leave everything else unchecked.

> **Note**: The Search Job API requires an Enterprise-tier Sumo Logic account. Free, Professional, and Essentials plans will get a 403 error. ([docs](https://www.sumologic.com/help/docs/api/search-job/))

### 2. Configure credentials

**macOS / Linux:**

```bash
cp .env.example .env
```

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

Edit `.env` and fill in your Access ID, Access Key, and API base URL:

```bash
SUMO_ACCESS_ID=your-access-id
SUMO_ACCESS_KEY=your-access-key
SUMO_API_BASE_URL=https://api.sumologic.com/api
```

See [Determine your API endpoint](#determine-your-api-endpoint) to find the correct URL for your region.

### 3. Verify it works

```bash
npm start
```

The server starts and listens on stdio. You'll see a startup log on stderr. Press Ctrl+C to stop.

> **Note**: `npm start` loads credentials from your `.env` file. When running via an MCP client (step 5), the client passes credentials through its own `env` block instead — the `.env` file is only needed for this manual verification step.

### 4. Connect to your MCP client

Add the server to your client's MCP configuration:

- **Kiro** — `.kiro/settings/mcp.json`
- **Claude Code** — `claude_code_config.json`
- **Cursor** — `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "sumo-mcp-readonly": {
      "command": "npx",
      "args": ["-y", "sumo-mcp-readonly"],
      "env": {
        "SUMO_ACCESS_ID": "your-access-id",
        "SUMO_ACCESS_KEY": "your-access-key",
        "SUMO_API_BASE_URL": "https://api.sumologic.com/api"
      }
    }
  }
}
```

> **Security note**: If your client supports environment variable references (e.g., `${SUMO_ACCESS_ID}`), prefer those over embedding credentials directly in config files. Set the variables in your shell profile instead.

## Tools

Once connected, your MCP client can use these tools:

### sumo_search_logs

Run any Sumo Logic query. This is the most flexible tool — anything you can type in the Sumo Logic search bar works here.

```json
{
  "query": "_sourceCategory=prod/api status=500 | count by _sourceHost",
  "lastMinutes": 30,
  "limit": 50
}
```

Supports explicit time ranges too:

```json
{
  "query": "error | count by _sourceCategory",
  "startTime": "2025-01-15T10:00:00Z",
  "endTime": "2025-01-15T11:00:00Z"
}
```

### sumo_find_errors

Opinionated error search — looks for ERROR, exception, failure, fatal, and stack traces without needing to write the full query.

```json
{
  "sourceCategory": "prod/api",
  "service": "user-service",
  "lastMinutes": 30,
  "text": "NullPointerException"
}
```

### sumo_search_correlation_id

Search for a trace ID, request ID, or correlation ID across your logs. The ID is safely escaped as a literal.

```json
{
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "sourceCategory": "prod/api",
  "lastMinutes": 60
}
```

### sumo_get_search_status

Check the status of a running search job. Only jobs created in the current session can be queried.

```json
{
  "jobId": "IUUQI-DGH5I-TJ045"
}
```

### sumo_cancel_search

Cancel a running search job. Only jobs created in the current session can be cancelled.

```json
{
  "jobId": "IUUQI-DGH5I-TJ045"
}
```

## Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` for local development, or pass them via your MCP client's `env` block.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUMO_ACCESS_ID` | Yes | — | Sumo Logic Access ID |
| `SUMO_ACCESS_KEY` | Yes | — | Sumo Logic Access Key |
| `SUMO_API_BASE_URL` | Yes | — | Regional API endpoint (see below) |
| `SUMO_DEFAULT_SOURCE_CATEGORY` | No | — | Default `_sourceCategory` for opinionated tools |
| `SUMO_MAX_QUERY_RANGE_MINUTES` | No | 1440 | Maximum allowed query time range in minutes |
| `SUMO_MAX_RESULT_COUNT` | No | 1000 | Maximum results returned per query |
| `SUMO_QUERY_TIMEOUT_SECONDS` | No | 120 | Timeout waiting for search job completion |
| `LOG_LEVEL` | No | info | Log verbosity (debug, info, warn, error) |

## Determine Your API Endpoint

Your `SUMO_API_BASE_URL` must match your Sumo Logic deployment region. Look at the URL in your browser when logged into Sumo Logic:

| If your URL contains | Your deployment | API Base URL |
|---------------------|-----------------|--------------|
| `service.sumologic.com` | US1 | `https://api.sumologic.com/api` |
| `service.us2.sumologic.com` | US2 | `https://api.us2.sumologic.com/api` |
| `service.eu.sumologic.com` | EU | `https://api.eu.sumologic.com/api` |
| `service.au.sumologic.com` | AU | `https://api.au.sumologic.com/api` |
| `service.jp.sumologic.com` | JP | `https://api.jp.sumologic.com/api` |
| `service.ca.sumologic.com` | CA | `https://api.ca.sumologic.com/api` |
| `service.de.sumologic.com` | DE | `https://api.de.sumologic.com/api` |
| `service.in.sumologic.com` | IN | `https://api.in.sumologic.com/api` |
| `service.fed.sumologic.com` | FED | `https://api.fed.sumologic.com/api` |

Custom/vanity URLs (e.g., `yourcompany.sumologic.com`) are typically on US1. If you get HTTP 301 errors, you're using the wrong endpoint.

## Security Model

This server is deliberately minimal and read-only:

- **Read-only** — only log search operations are supported
- **No administration** — no collector, user, role, token, partition, or source management
- **No content mutation** — no creation, deletion, or modification of Sumo Logic resources
- **No shell execution** — no arbitrary command execution
- **No persistent storage** — query results are not stored to disk
- **Credentials never logged** — access keys are redacted from all log output
- **Job isolation** — only search jobs created by this process can be queried or cancelled

> **WARNING**: Sumo Logic query results may contain PII, secrets, API keys, or other sensitive data depending on what your applications log. Only use this server with MCP clients connected to AI services you trust with your log data.

## Troubleshooting

**401 Unauthorized** — Your Access ID or Key is wrong, revoked, or expired. Double-check both values.

**403 Forbidden** — The access key's role doesn't have "Run Log Search" capability.

**301 Redirect** — Wrong regional API endpoint. See the table above. The URL must NOT end with a trailing slash.

**Timeout** — Increase `SUMO_QUERY_TIMEOUT_SECONDS`, narrow your time range, or simplify the query. Large searches can take minutes.

**400 Bad Request** — Query syntax error. Check your Sumo Logic query syntax and field names.

**429 Rate Limited** — Sumo Logic allows 4 requests/second per user and 200 concurrent jobs per org. Reduce query frequency.

## Credential Rotation

1. Create a new access key in Sumo Logic (Administration > Security > Access Keys)
2. Update `SUMO_ACCESS_ID` and `SUMO_ACCESS_KEY` in your `.env` or MCP client config
3. Restart the MCP server (your client will do this automatically on config change)
4. Verify with a simple query
5. Revoke the old key in Sumo Logic

## Development

```bash
npm run dev          # Run with tsx (no build step needed)
npm run build        # Compile TypeScript
npm test             # Run unit tests (68 tests)
npm run test:watch   # Watch mode
npm run lint         # ESLint
npm run format       # Prettier
npm run format:check # Check formatting without writing
```

## Architecture

```
src/
  index.ts            — Entry point, config validation, server startup
  server.ts           — MCP server creation and tool registration
  config.ts           — Environment variable validation (Zod)
  logging.ts          — Structured JSON logger (stderr only)
  sumo/
    client.ts         — HTTP client with auth, cookies, error mapping
    auth.ts           — HTTP Basic authentication header
    types.ts          — Sumo Logic API type definitions
    search-jobs.ts    — Search lifecycle orchestration
    errors.ts         — Typed error hierarchy
  tools/
    search-logs.ts    — sumo_search_logs implementation
    find-errors.ts    — sumo_find_errors implementation
    search-correlation-id.ts — sumo_search_correlation_id implementation
    get-search-status.ts     — sumo_get_search_status implementation
    cancel-search.ts         — sumo_cancel_search implementation
  query/
    escaping.ts       — Query literal escaping
    builders.ts       — Opinionated query construction
  security/
    redaction.ts      — Credential redaction for error output
    limits.ts         — Time range and result count enforcement
```

## License

MIT
