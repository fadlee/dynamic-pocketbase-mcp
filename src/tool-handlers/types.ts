import type { ToolInput, ToolName } from '../tool-definitions.js';
import type { PocketBaseApi } from '../pocketbase-api.js';

export type ToolHandlers = { [N in ToolName]: (args: ToolInput<N>) => Promise<unknown> };
export type ToolHandlerMap = Partial<ToolHandlers>;

export interface ToolHandlerContext {
  api: PocketBaseApi;
}
