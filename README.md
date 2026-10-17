# dynamic-pocketbase-mcp

Dynamic Model Context Protocol (MCP) server for PocketBase. Connect your AI client once, then manage collections and records in any PocketBase project using runtime tools.

## Why this server is different

Many PocketBase MCP servers are static: they hardcode collection-specific behavior or require custom tool definitions per schema.

`dynamic-pocketbase-mcp` is dynamic:
- Uses collection-agnostic tools (`list_collections`, `list_records`, `create_record`, etc.)
- Works across existing and newly created collections without regenerating server code
- Exposes live PocketBase collections as MCP resources

## Features

- 20 MCP tools for health, auth, collections, rules, and records
- Collection lifecycle operations (create, update, delete, inspect)
- Record CRUD with filters, sorting, pagination, and field selection
- Superuser auth from environment variables with automatic token refresh, or session auth via tools (`auth_admin`, `auth_user`, `get_auth_status`, `logout`)
- Transactional multi-record writes with `batch_records`
- Built-in references for field schema, schema patch examples, and rules syntax

## Installation

```bash
npm install dynamic-pocketbase-mcp
# or
bun install dynamic-pocketbase-mcp
```

## Configure in an AI client

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "dynamic-pocketbase": {
      "command": "npx",
      "args": ["-y", "dynamic-pocketbase-mcp"]
    }
  }
}
```

If `POCKETBASE_URL` is not set, the server defaults to `http://localhost:8090`.

To keep superuser credentials out of the chat, pass them as environment variables instead of using `auth_admin`:

```json
{
  "mcpServers": {
    "dynamic-pocketbase": {
      "command": "npx",
      "args": ["-y", "dynamic-pocketbase-mcp"],
      "env": {
        "POCKETBASE_URL": "https://pb.example.com",
        "POCKETBASE_ADMIN_EMAIL": "admin@example.com",
        "POCKETBASE_ADMIN_PASSWORD": "your-password"
      }
    }
  }
}
```

## Direct usage

```bash
# Use default URL (http://localhost:8090)
npx -y dynamic-pocketbase-mcp

# Use custom PocketBase URL
POCKETBASE_URL=https://pb.example.com \
bunx dynamic-pocketbase-mcp
```

## Simple tutorial: chat with AI using this MCP

After you configure your MCP client, open a chat and try prompts like this:

1. "Set PocketBase URL to `https://pb.example.com`."
2. "Check my PocketBase server health."
3. "List all PocketBase collections."
4. "Authenticate as admin with email `<your-email>` and password `<your-password>`."
5. "Create a collection named `notes` with a required `title` text field."
6. "Create a record in `notes` with title `First note`."
7. "Show all records in `notes`, newest first."
8. "Log out from PocketBase auth session."

If those steps succeed, your AI can now manage schema and data through this MCP server.

## Authentication

**Environment (recommended for superusers).** Set `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD`. The server logs in on the first request and logs in again shortly before the token expires. You can also set `POCKETBASE_TOKEN` (for example a long-lived superuser API token). It is used as is, and if credentials are also set, they take over when it expires. Superusers with MFA/OTP enabled cannot use password login.

Automatic login stops as soon as you call `auth_admin`, `auth_user`, `logout`, or `set_base_url`. This means the credentials are never sent to a different server URL. `get_auth_status` reports `autoAuth: true` while it is active.

**Tools.** `auth_admin` or `auth_user`, then `get_auth_status`, then `logout`.

## Available tools

### Health and references
- `health` - Check PocketBase server health status
- `set_base_url` - Update PocketBase URL for current MCP session and clear auth token
- `get_field_schema_reference` - Get field types documentation plus create/update schema examples
- `get_rules_reference` - Get API rules syntax reference

### Authentication
- `auth_admin` - Authenticate as admin/superuser
- `auth_user` - Authenticate as auth collection user (email/username)
- `get_auth_status` - Check current authentication status
- `logout` - Clear authentication session

### Collections
- `list_collections` - List all collections
- `view_collection` - View collection by name or ID
- `create_collection` - Create new collection (auto-adds `created` and `updated` autodate fields for base/auth collections unless provided)
- `update_collection` - Update collection schema/settings (partial object updates allowed; use `fieldUpdates`/`removeFields` for MCP-side schema merging, `newName` inside `fieldUpdates` to rename a field without losing data, or `fields` for direct full-array replacement; see `get_field_schema_reference` examples)
- `delete_collection` - Delete collection
- `update_collection_rules` - Update access control rules

### Records
- `list_records` - List/search records with filtering, sorting, pagination (`skipTotal` for faster queries on large collections)
- `view_record` - View single record by ID
- `create_record` - Create new record
- `update_record` - Update existing record
- `delete_record` - Delete record
- `batch_records` - Create/update/upsert/delete multiple records in one transaction (requires Batch API enabled in PocketBase settings)

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type check
bun run typecheck

# Run tests (builds dist first)
bun run test

# Run live integration test against a real PocketBase instance.
# This uses @fadlee/pocketbase-bin to provision PocketBase automatically.
bun run test:live

# Run all checks (typecheck + tests)
bun run check

# Interactive release helper (bump, check, publish, push tag)
bun run release

# Build for production
bun run build
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POCKETBASE_URL` | No | PocketBase server URL (default: `http://localhost:8090`) |
| `POCKETBASE_ADMIN_EMAIL` | No | Superuser email for automatic login (set together with password) |
| `POCKETBASE_ADMIN_PASSWORD` | No | Superuser password for automatic login |
| `POCKETBASE_TOKEN` | No | Pre-issued auth token sent with every request |

Additional live-test environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `POCKETBASE_LIVE_ADMIN_EMAIL` | No | Admin email for live test bootstrap (default: `admin@example.com`) |
| `POCKETBASE_LIVE_ADMIN_PASSWORD` | No | Admin password for live test bootstrap (default: `supersecret123`) |

## License

MIT
