import { parseBatchRecordsArgs, parseCreateRecordArgs, parseDeleteRecordArgs, parseListRecordsArgs, parseUpdateRecordArgs, parseViewRecordArgs } from '../validators/records.js';
import type { ToolHandlerContext, ToolHandlerMap } from './types.js';

export function createRecordToolHandlers(context: ToolHandlerContext): ToolHandlerMap {
  const { api } = context;

  return {
    list_records: async (args) => api.listRecords(parseListRecordsArgs(args)),
    view_record: async (args) => api.viewRecord(parseViewRecordArgs(args)),
    create_record: async (args) => api.createRecord(parseCreateRecordArgs(args)),
    update_record: async (args) => api.updateRecord(parseUpdateRecordArgs(args)),
    batch_records: async (args) => api.batchRecords(parseBatchRecordsArgs(args)),
    delete_record: async (args) => {
      const parsed = parseDeleteRecordArgs(args);
      return api.deleteRecord(parsed.collection, parsed.id);
    },
  };
}
