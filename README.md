# dynamic-pocketbase-mcp

Dynamic Model Context Protocol (MCP) server for PocketBase. Connect your AI client once, then manage collections and records in any PocketBase project using runtime tools.

## Why this server is different

Many PocketBase MCP servers are static: they hardcode collection-specific behavior or require custom tool definitions per schema.

`dynamic-pocketbase-mcp` is dynamic:
- Uses collection-agnostic tools (`list_collections`, `list_records`, `create_record`, etc.)
- Works across existing and newly created collections without regenerating server code
- Exposes live PocketBase collections as MCP resources

## Features

- 18 MCP tools for health, auth, collections, rules, and records
- Collection lifecycle operations (create, update, delete, inspect)
- Record CRUD with filters, sorting, pagination, and field selection
- Session-based auth via tools (`auth_admin`, `auth_user`, `get_auth_status`, `logout`)
- Built-in references for field schema and rules syntax

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

## Authentication flow (via tools)

1. `auth_admin` or `auth_user`
2. `get_auth_status`
3. `logout`

## Available tools

### Health and references
- `health` - Check PocketBase server health status
- `set_base_url` - Update PocketBase URL for current MCP session and clear auth token
- `get_field_schema_reference` - Get field types documentation
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
- `update_collection` - Update collection schema/settings
- `delete_collection` - Delete collection
- `update_collection_rules` - Update access control rules

### Records
- `list_records` - List/search records with filtering, sorting, pagination
- `view_record` - View single record by ID
- `create_record` - Create new record
- `update_record` - Update existing record
- `delete_record` - Delete record

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

## License

MIT
