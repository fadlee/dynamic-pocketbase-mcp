import { ValidationError } from './errors.js';
import { HttpClient, type AuthOptions } from './http-client.js';
import { PocketBaseApi } from './pocketbase-api.js';
import { createAuthToolHandlers } from './tool-handlers/auth.js';
import { createCollectionToolHandlers } from './tool-handlers/collections.js';
import { createMetaToolHandlers } from './tool-handlers/meta.js';
import { createRecordToolHandlers } from './tool-handlers/records.js';
import type { ToolHandlerMap, ToolHandlers } from './tool-handlers/types.js';
import { TOOL_DEFINITIONS, findToolDefinition, parseToolInput } from './tool-definitions.js';

export class PocketBaseMCPServer {
  private readonly http: HttpClient;
  private readonly api: PocketBaseApi;
  private readonly toolHandlers: ToolHandlers;

  constructor(baseUrl: string, auth?: AuthOptions) {
    this.http = new HttpClient(baseUrl, auth);
    this.api = new PocketBaseApi(this.http);
    this.toolHandlers = this.createToolHandlers();
  }

  private createToolHandlers(): ToolHandlers {
    const handlers: ToolHandlerMap = {
      ...createMetaToolHandlers({ api: this.api }),
      ...createAuthToolHandlers({ api: this.api }),
      ...createCollectionToolHandlers({ api: this.api }),
      ...createRecordToolHandlers({ api: this.api }),
    };

    const missing = TOOL_DEFINITIONS.map((tool) => tool.name).filter((name) => !handlers[name]);
    if (missing.length > 0) {
      throw new Error(`Missing tool handlers: ${missing.join(', ')}`);
    }

    return handlers as ToolHandlers;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const definition = findToolDefinition(toolName);
    if (!definition) {
      throw new ValidationError(`Unknown tool: ${toolName}`);
    }

    const handler = this.toolHandlers[definition.name] as (args: unknown) => Promise<unknown>;
    return handler(parseToolInput(definition.input, args));
  }

  async listResources(): Promise<
    Array<{ uri: string; name: string; description: string; mimeType: string }>
  > {
    return this.api.listResources();
  }

  async readResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
    return this.api.readResource(uri);
  }
}
