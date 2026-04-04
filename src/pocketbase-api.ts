import type {
  AuthAdminArgs,
  AuthUserArgs,
  Collection,
  CollectionField,
  CreateCollectionArgs,
  CreateRecordArgs,
  HealthResponse,
  ListRecordsArgs,
  ListResult,
  PBRecord,
  UpdateRecordArgs,
  UpdateRulesArgs,
  ViewRecordArgs,
} from './types.js';
import { ValidationError } from './errors.js';
import { HttpClient } from './http-client.js';

interface PocketBaseAuthResponse {
  token?: string;
  record?: Record<string, unknown>;
  [key: string]: unknown;
}

const DEFAULT_COLLECTION_SYSTEM_FIELDS: ReadonlyArray<CollectionField> = [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false, system: true },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true, system: true },
];

export class PocketBaseApi {
  constructor(private readonly http: HttpClient) {}

  private getTokenPreview(token: string | null): string | null {
    if (!token) {
      return null;
    }

    if (token.length <= 12) {
      return `${token.slice(0, 4)}...`;
    }

    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  }

  async authAdmin(args: AuthAdminArgs) {
    const result = await this.http.request<PocketBaseAuthResponse>(
      'POST',
      '/api/collections/_superusers/auth-with-password',
      {
        identity: args.identity,
        password: args.password,
      },
      undefined,
      false
    );

    this.http.setToken(result.token || null);

    return {
      authenticated: Boolean(result.token),
      mode: 'admin',
      tokenPreview: this.getTokenPreview(this.http.getToken()),
      record: result.record ?? null,
    };
  }

  async authUser(args: AuthUserArgs) {
    const result = await this.http.request<PocketBaseAuthResponse>(
      'POST',
      `/api/collections/${encodeURIComponent(args.collection)}/auth-with-password`,
      {
        identity: args.identity,
        password: args.password,
      },
      undefined,
      false
    );

    this.http.setToken(result.token || null);

    return {
      authenticated: Boolean(result.token),
      mode: 'user',
      collection: args.collection,
      tokenPreview: this.getTokenPreview(this.http.getToken()),
      record: result.record ?? null,
    };
  }

  getAuthStatus() {
    const token = this.http.getToken();
    return {
      authenticated: Boolean(token),
      tokenPreview: this.getTokenPreview(token),
      baseUrl: this.http.getBaseUrl(),
    };
  }

  logout() {
    this.http.clearToken();
    return {
      message: 'Authentication session cleared',
      authenticated: false,
    };
  }

  setBaseUrl(url: string) {
    this.http.setBaseUrl(url);
    return {
      message: 'PocketBase URL updated. Re-authenticate if needed.',
      baseUrl: this.http.getBaseUrl(),
      authenticated: false,
    };
  }

  async health(): Promise<HealthResponse> {
    return this.http.request<HealthResponse>('GET', '/api/health');
  }

  async listCollections() {
    const result = await this.http.request<ListResult<Collection>>('GET', '/api/collections');

    return {
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items.map((col) => ({
        id: col.id,
        name: col.name,
        type: col.type,
        fields: col.fields?.length || 0,
        system: col.system || false,
      })),
    };
  }

  async viewCollection(collection: string): Promise<Collection> {
    return this.http.request<Collection>('GET', `/api/collections/${encodeURIComponent(collection)}`);
  }

  private getCreateCollectionFields(data: CreateCollectionArgs): CollectionField[] {
    const type = data.type || 'base';
    const fields = [...(data.fields || [])];

    if (type === 'view') {
      return fields;
    }

    const existingFieldNames = new Set(fields.map((field) => field.name));

    for (const field of DEFAULT_COLLECTION_SYSTEM_FIELDS) {
      if (!existingFieldNames.has(field.name)) {
        fields.push({ ...field });
      }
    }

    return fields;
  }

  async createCollection(data: CreateCollectionArgs): Promise<Collection> {
    const payload: Record<string, unknown> = {
      name: data.name,
      type: data.type || 'base',
      fields: this.getCreateCollectionFields(data),
    };

    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'] as const) {
      if (data[rule] !== undefined) {
        payload[rule] = data[rule];
      }
    }

    if (data.indexes && data.indexes.length > 0) {
      payload.indexes = data.indexes;
    }

    return this.http.request<Collection>('POST', '/api/collections', payload);
  }

  async updateCollection(collection: string, data: Record<string, unknown>): Promise<Collection> {
    return this.http.request<Collection>(
      'PATCH',
      `/api/collections/${encodeURIComponent(collection)}`,
      data
    );
  }

  async deleteCollection(collection: string): Promise<{ message: string }> {
    await this.http.request('DELETE', `/api/collections/${encodeURIComponent(collection)}`);
    return { message: 'Collection deleted successfully' };
  }

  async updateCollectionRules(args: UpdateRulesArgs): Promise<{
    message: string;
    collection: string;
    updatedRules: string[];
    currentRules: Record<string, string | null>;
  }> {
    const { collection, ...rules } = args;
    const payload: Record<string, unknown> = {};

    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'] as const) {
      if (rule in rules) {
        payload[rule] = rules[rule];
      }
    }

    if (Object.keys(payload).length === 0) {
      return {
        message: 'No rules specified to update',
        collection,
        updatedRules: [],
        currentRules: {},
      };
    }

    const result = await this.http.request<Collection>(
      'PATCH',
      `/api/collections/${encodeURIComponent(collection)}`,
      payload
    );

    return {
      message: 'Collection rules updated successfully',
      collection,
      updatedRules: Object.keys(payload),
      currentRules: {
        listRule: result.listRule ?? null,
        viewRule: result.viewRule ?? null,
        createRule: result.createRule ?? null,
        updateRule: result.updateRule ?? null,
        deleteRule: result.deleteRule ?? null,
      },
    };
  }

  async listRecords(args: ListRecordsArgs): Promise<ListResult<PBRecord>> {
    const { collection, ...options } = args;
    const query: Record<string, string | number> = {};

    for (const key of ['page', 'perPage', 'sort', 'filter', 'expand', 'fields'] as const) {
      if (options[key] !== undefined && options[key] !== null && options[key] !== '') {
        query[key] = options[key]!;
      }
    }

    return this.http.request<ListResult<PBRecord>>(
      'GET',
      `/api/collections/${encodeURIComponent(collection)}/records`,
      null,
      query
    );
  }

  async viewRecord(args: ViewRecordArgs): Promise<PBRecord> {
    const { collection, id, ...options } = args;
    const query: Record<string, string | number> = {};

    for (const key of ['expand', 'fields'] as const) {
      if (options[key] !== undefined && options[key] !== null && options[key] !== '') {
        query[key] = options[key]!;
      }
    }

    return this.http.request<PBRecord>(
      'GET',
      `/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`,
      null,
      query
    );
  }

  async createRecord(args: CreateRecordArgs): Promise<PBRecord> {
    const { collection, data, expand } = args;
    const query: Record<string, string | number> = {};

    if (expand) {
      query.expand = expand;
    }

    return this.http.request<PBRecord>(
      'POST',
      `/api/collections/${encodeURIComponent(collection)}/records`,
      data,
      query
    );
  }

  async updateRecord(args: UpdateRecordArgs): Promise<PBRecord> {
    const { collection, id, data, expand } = args;
    const query: Record<string, string | number> = {};

    if (expand) {
      query.expand = expand;
    }

    return this.http.request<PBRecord>(
      'PATCH',
      `/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`,
      data,
      query
    );
  }

  async deleteRecord(collection: string, id: string): Promise<{ message: string }> {
    await this.http.request(
      'DELETE',
      `/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`
    );
    return { message: 'Record deleted successfully' };
  }

  async listResources(): Promise<
    Array<{ uri: string; name: string; description: string; mimeType: string }>
  > {
    const collections = await this.listCollections();
    const items = collections.items || [];

    return items.map((col) => ({
      uri: `pocketbase://collection/${col.name}`,
      name: col.name,
      description: `Collection: ${col.name} (type: ${col.type})`,
      mimeType: 'application/json',
    }));
  }

  async readResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
    const match = uri.match(/^pocketbase:\/\/collection\/(.+)$/);
    if (!match) {
      throw new ValidationError('Invalid resource URI');
    }

    const collection = match[1];
    const data = await this.viewCollection(collection);

    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(data, null, 2),
    };
  }
}
