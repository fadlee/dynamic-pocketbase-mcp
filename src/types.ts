export interface PocketBaseConfig {
  baseUrl: string;
  token?: string;
}

export interface CollectionField {
  name: string;
  type: string;
  required?: boolean;
  hidden?: boolean;
  presentable?: boolean;
  system?: boolean;
  [key: string]: unknown;
}

export interface Collection {
  id: string;
  name: string;
  type: 'base' | 'auth' | 'view';
  fields: CollectionField[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
  indexes?: string[];
  [key: string]: unknown;
}

export interface PBRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  [key: string]: unknown;
}

export interface ListResult<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export interface HealthResponse {
  code: number;
  message: string;
  data: {
    canBackup: boolean;
  };
}

export interface CreateCollectionArgs {
  name: string;
  type?: 'base' | 'auth' | 'view';
  fields?: CollectionField[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
  indexes?: string[];
}

export interface UpdateCollectionArgs {
  collection: string;
  data?: Record<string, unknown>;
  fields?: CollectionField[];
  indexes?: string[];
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
}

export interface UpdateRulesArgs {
  collection: string;
  listRule?: string | null;
  viewRule?: string | null;
  createRule?: string | null;
  updateRule?: string | null;
  deleteRule?: string | null;
}

export interface ListRecordsArgs {
  collection: string;
  page?: number;
  perPage?: number;
  sort?: string;
  filter?: string;
  expand?: string;
  fields?: string;
}

export interface ListCollectionsArgs {
  page?: number;
  perPage?: number;
}

export interface ViewRecordArgs {
  collection: string;
  id: string;
  expand?: string;
  fields?: string;
}

export interface CreateRecordArgs {
  collection: string;
  data: Record<string, unknown>;
  expand?: string;
}

export interface UpdateRecordArgs {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  expand?: string;
}

export interface DeleteRecordArgs {
  collection: string;
  id: string;
}

export interface AuthAdminArgs {
  identity: string;
  password: string;
}

export interface AuthUserArgs {
  collection: string;
  identity: string;
  password: string;
}
