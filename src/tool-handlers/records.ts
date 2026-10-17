import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

export function createRecordToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    list_records: async (args) => api.listRecords(args),
    view_record: async (args) => api.viewRecord(args),
    create_record: async (args) => api.createRecord(args),
    update_record: async (args) => api.updateRecord(args),
    batch_records: async (args) => api.batchRecords(args.requests),
    delete_record: async (args) => api.deleteRecord(args.collection, args.id),
  };
}
