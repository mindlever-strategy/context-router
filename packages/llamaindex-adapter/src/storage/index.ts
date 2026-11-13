/**
 * Storage module for Context Router
 * Provides document storage and retrieval capabilities
 */

// Document types
export interface DocumentSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export interface ContextRouterDocumentStoreConfig {
  serverUrl: string;
  apiKey?: string;
  defaultChunkSize?: number;
  defaultChunkOverlap?: number;
}

// Chat Memory types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface MemoryContext {
  messages: ChatMessage[];
  metadata: Record<string, unknown>;
}

export interface ContextRouterChatMemoryConfig {
  serverUrl: string;
  apiKey?: string;
  maxMessages?: number;
}

// Retrieval types
export interface RetrievalFilters {
  workflowId?: string;
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  tags?: string[];
}

export interface ContextRouterRetrieverConfig {
  serverUrl: string;
  apiKey?: string;
  similarityTopK?: number;
}

export interface RetrievalResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

export interface QueryResponse {
  response: string;
  sourceNodes: RetrievalResult[];
  metadata: Record<string, unknown>;
}

export interface ContextRouterQueryEngineConfig {
  serverUrl: string;
  apiKey?: string;
  llmModel?: string;
  temperature?: number;
}

// Sync types
export interface SyncTriggers {
  onStateChange?: boolean;
  onCheckpoint?: boolean;
  onInterval?: number; // milliseconds
}

export interface SyncOptions {
  batchSize?: number;
  includeHistory?: boolean;
  filterKeys?: string[];
}

export interface SyncEvent {
  type: 'sync' | 'error' | 'skip';
  workflowId: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface StateSyncServiceConfig {
  serverUrl: string;
  apiKey?: string;
  triggers?: SyncTriggers;
  workspaceId: string;
}

// Knowledge Graph types
export interface ExtractionOptions {
  extractEntities?: boolean;
  extractRelationships?: boolean;
  maxDepth?: number;
}

export interface StorageOptions {
  includeMetadata?: boolean;
  chunkSize?: number;
}

export interface EntityPath {
  entity: string;
  type: string;
  path: string[];
}

export interface GraphQueryResult {
  entities: Array<{
    name: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    properties: Record<string, unknown>;
  }>;
}

export interface ContextRouterKnowledgeGraphConfig {
  serverUrl: string;
  apiKey?: string;
  workspaceId: string;
}

// MCP tool types
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Document Store implementation
export class ContextRouterDocumentStore {
  private config: ContextRouterDocumentStoreConfig;

  constructor(config: ContextRouterDocumentStoreConfig) {
    this.config = {
      defaultChunkSize: 512,
      defaultChunkOverlap: 50,
      ...config,
    };
  }

  async addDocuments(
    documents: Array<{ text: string; metadata?: Record<string, unknown> }>,
    options?: { chunkSize?: number; chunkOverlap?: number },
  ): Promise<{ ids: string[] }> {
    const chunkSize = options?.chunkSize ?? this.config.defaultChunkSize ?? 512;
    const chunkOverlap =
      options?.chunkOverlap ?? this.config.defaultChunkOverlap ?? 50;

    const ids: string[] = [];
    for (const doc of documents) {
      const chunks = this.chunkText(doc.text, chunkSize, chunkOverlap);
      for (const _chunk of chunks) {
        ids.push(this.generateId());
      }
    }

    return { ids };
  }

  async search(
    query: string,
    _options?: { topK?: number },
  ): Promise<DocumentSearchResult[]> {
    // Stub: implement with llamaindex vector store
    console.log('[ContextRouterDocumentStore] Search:', query);
    return [];
  }

  async delete(id: string): Promise<void> {
    console.log('[ContextRouterDocumentStore] Delete:', id);
  }

  private chunkText(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): string[] {
    const chunks: string[] = [];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return chunks;
    }

    const size = Math.max(1, chunkSize);
    const overlap = Math.min(Math.max(0, chunkOverlap), size - 1);
    let start = 0;

    while (start < words.length) {
      const end = Math.min(start + size, words.length);
      chunks.push(words.slice(start, end).join(' '));
      if (end >= words.length) {
        break;
      }
      start = end - overlap;
    }

    return chunks;
  }

  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
