#!/usr/bin/env node

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { serializeError } from './errors.js';
import { PocketBaseMCPServer } from './server.js';
import { getToolDefinitions } from './tool-definitions.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const DEFAULT_POCKETBASE_URL = 'http://localhost:8090';
const POCKETBASE_URL = process.env.POCKETBASE_URL || DEFAULT_POCKETBASE_URL;

const { POCKETBASE_TOKEN, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } = process.env;

if (Boolean(POCKETBASE_ADMIN_EMAIL) !== Boolean(POCKETBASE_ADMIN_PASSWORD)) {
  console.error('POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD must be set together');
  process.exit(1);
}

const pbServer = new PocketBaseMCPServer(POCKETBASE_URL, {
  token: POCKETBASE_TOKEN,
  identity: POCKETBASE_ADMIN_EMAIL,
  password: POCKETBASE_ADMIN_PASSWORD,
});

const mcpServer = new McpServer(
  {
    name: 'dynamic-pocketbase-mcp',
    version,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

const server = mcpServer.server;

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getToolDefinitions(),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await pbServer.callTool(name, args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    const serialized = serializeError(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: serialized }),
        },
      ],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = await pbServer.listResources();
  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    const content = await pbServer.readResource(uri);
    return {
      contents: [content],
    };
  } catch (error) {
    const serialized = serializeError(error);
    throw new Error(`[${serialized.type}] ${serialized.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
