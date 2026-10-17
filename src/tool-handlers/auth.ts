import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

export function createAuthToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    auth_admin: async (args) => api.authAdmin(args),
    auth_user: async (args) => api.authUser(args),
    get_auth_status: async () => api.getAuthStatus(),
    logout: async () => api.logout(),
  };
}
