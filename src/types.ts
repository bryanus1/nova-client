export interface NovaHeader {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface NovaQueryParam {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

export interface NovaBody {
  mode: 'none' | 'raw' | 'urlencoded' | 'formdata';
  raw?: string;
  urlencoded?: { key: string; value: string; disabled?: boolean; description?: string }[];
  formdata?: { key: string; value: string; type: 'text' | 'file'; disabled?: boolean; description?: string }[];
  options?: {
    raw?: {
      language: 'json' | 'text' | 'html' | 'xml' | 'javascript';
    };
  };
}

export interface NovaRequest {
  method: string;
  url: {
    raw: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: NovaQueryParam[];
  } | string;
  header?: NovaHeader[];
  body?: NovaBody;
  description?: string;
}

export interface NovaItem {
  id: string; // Internal unique ID or postman ID
  name: string;
  description?: string;
  request?: NovaRequest; // If request is defined, it is a Request item. Otherwise, it is a Folder.
  item?: NovaItem[]; // Sub-items (folders/requests)
}

export interface NovaCollection {
  info: {
    _postman_id?: string;
    name: string;
    description?: string;
    schema: string; // e.g. "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  };
  item: NovaItem[];
}

export interface EnvironmentValue {
  key: string;
  value: string;
  enabled: boolean;
  type?: 'text' | 'secret';
}

export interface NovaEnvironment {
  id: string;
  name: string;
  values: EnvironmentValue[];
  _postman_variable_scope?: 'environment';
}

// Tree view Node representation
export interface NovaNode {
  id: string;
  name: string;
  type: 'collection' | 'folder' | 'request' | 'environments-header' | 'environment';
  collectionId?: string; // Path or collection ID this node belongs to
  environmentId?: string; // If type is 'environment'
  filePath?: string; // Full URI file path containing the collection/environment
  requestIndex?: number[]; // Array of indices to traverse to find the request item in the collection
}
