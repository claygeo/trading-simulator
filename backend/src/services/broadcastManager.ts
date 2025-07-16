// backend/src/services/broadcastManager.ts - FIXED: Null Safety & Interface Mismatch Resolution
import { WebSocket, WebSocketServer } from 'ws';

interface UpdateMessage {
  type: string;
  data: any;
  timestamp: number;
  priority?: number;
}

interface ClientSubscription {
  simulationId: string;
  lastUpdate: number;
  compressionEnabled: boolean;
  messageCount: number;
}

export class BroadcastManager {
  private updateBuffer: Map<string, UpdateMessage[]> = new Map();
  private broadcastInterval: NodeJS.Timeout;
  private compressionEnabled: boolean = false; // DISABLED to prevent Blob conversion
  private clientSubscriptions: Map<WebSocket, ClientSubscription> = new Map();
  private broadcastBatchSize: number = 50;
  private broadcastIntervalMs: number = 25; // Reduced to 25ms for faster updates
  private immediateTypes = new Set([
    'price_update', 
    'trade', 
    'processed_trade',
    'simulation_status', 
    'simulation_reset', 
    'simulation_state'
  ]);
  
  // CRITICAL FIX: Add client management by simulation
  private simulationClients: Map<string, Set<WebSocket>> = new Map();
  
  private metrics = {
    totalMessagesSent: 0,
    totalBatchesSent: 0,
    averageQueueDepth: 0,
    lastFlushTime: Date.now(),
    textFramesSent: 0,
    binaryFramesSent: 0,
    serializationErrors: 0,
    corruptedBatches: 0,
    clientsAdded: 0,
    clientsRemoved: 0,
    connectionErrors: 0
  };
  
  constructor(private wss?: WebSocketServer) {
    // CRITICAL FIX: Handle case where WebSocketServer might be undefined
    console.log('🚀 BroadcastManager initializing...', {
      webSocketServerProvided: !!wss,
      webSocketServerHasClients: !!(wss?.clients)
    });
    
    // Start the broadcast interval for batched updates
    this.broadcastInterval = setInterval(() => {
      this.flushUpdates();
    }, this.broadcastIntervalMs);
    
    // Monitor queue depth
    setInterval(() => {
      this.calculateMetrics();
    }, 1000);
    
    console.log('✅ BroadcastManager initialized with FIXED interface methods and null safety');
  }
  
  // CRITICAL FIX: Add missing addClient method
  addClient(simulationId: string, client: WebSocket): void {
    console.log(`📡 FIXED: Adding client to simulation ${simulationId}`);
    
    try {
      // Add to simulation clients map
      if (!this.simulationClients.has(simulationId)) {
        this.simulationClients.set(simulationId, new Set());
      }
      this.simulationClients.get(simulationId)!.add(client);
      
      // Add to client subscriptions
      this.clientSubscriptions.set(client, {
        simulationId: simulationId,
        lastUpdate: Date.now(),
        compressionEnabled: false,
        messageCount: 0
      });
      
      this.metrics.clientsAdded++;
      
      // Set up message handlers
      this.setupClientHandlers(client);
      
      console.log(`✅ FIXED: Client added to simulation ${simulationId}. Total clients: ${this.simulationClients.get(simulationId)?.size || 0}`);
      
    } catch (error) {
      console.error('❌ FIXED: Error adding client:', error);
      this.metrics.connectionErrors++;
    }
  }
  
  // CRITICAL FIX: Add missing removeClient method
  removeClient(simulationId: string, client: WebSocket): void {
    console.log(`📡 FIXED: Removing client from simulation ${simulationId}`);
    
    try {
      // Remove from simulation clients map
      if (this.simulationClients.has(simulationId)) {
        this.simulationClients.get(simulationId)!.delete(client);
        
        // Clean up empty simulation client sets
        if (this.simulationClients.get(simulationId)!.size === 0) {
          this.simulationClients.delete(simulationId);
          console.log(`🧹 FIXED: Cleaned up empty client set for simulation ${simulationId}`);
        }
      }
      
      // Remove from client subscriptions
      this.clientSubscriptions.delete(client);
      
      this.metrics.clientsRemoved++;
      
      // Clean up client handlers
      this.cleanupClientHandlers(client);
      
      console.log(`✅ FIXED: Client removed from simulation ${simulationId}. Remaining clients: ${this.simulationClients.get(simulationId)?.size || 0}`);
      
    } catch (error) {
      console.error('❌ FIXED: Error removing client:', error);
      this.metrics.connectionErrors++;
    }
  }
  
  // CRITICAL FIX: Enhanced registerClient method that works with new interface
  registerClient(ws: WebSocket, simulationId?: string): void {
    console.log('📡 FIXED: Registering client with enhanced interface compatibility');
    
    // Don't re-register if already exists
    if (this.clientSubscriptions.has(ws)) {
      console.log('Client already registered in BroadcastManager');
      return;
    }
    
    const defaultSimulationId = simulationId || '';
    
    // Use addClient method for consistency
    if (defaultSimulationId) {
      this.addClient(defaultSimulationId, ws);
    } else {
      // Handle case where no simulation ID is provided
      this.clientSubscriptions.set(ws, {
        simulationId: '',
        lastUpdate: Date.now(),
        compressionEnabled: false,
        messageCount: 0
      });
      
      this.setupClientHandlers(ws);
    }
    
    console.log('✅ FIXED: Client registered with enhanced interface');
  }
  
  // CRITICAL FIX: Setup client handlers with proper cleanup
  private setupClientHandlers(ws: WebSocket): void {
    // Listen for subscription messages
    const messageHandler = (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'subscribe') {
          this.handleSubscription(ws, message.simulationId);
        } else if (message.type === 'compression') {
          // Ignore compression requests - we don't use compression
          console.log('⚠️ Compression request ignored - compression disabled to prevent Blob issues');
        }
      } catch (error) {
        // Ignore parsing errors as they might be handled elsewhere
      }
    };
    
    // Store the handler so we can remove it later
    (ws as any)._broadcastMessageHandler = messageHandler;
    ws.on('message', messageHandler);
    
    // Clean up on close
    const closeHandler = () => {
      this.handleClientDisconnection(ws);
    };
    
    (ws as any)._broadcastCloseHandler = closeHandler;
    ws.on('close', closeHandler);
    
    // Handle errors
    const errorHandler = (error: Error) => {
      console.error('❌ FIXED: WebSocket client error:', error);
      this.handleClientDisconnection(ws);
    };
    
    (ws as any)._broadcastErrorHandler = errorHandler;
    ws.on('error', errorHandler);
  }
  
  // CRITICAL FIX: Cleanup client handlers
  private cleanupClientHandlers(ws: WebSocket): void {
    try {
      // Remove message handler
      if ((ws as any)._broadcastMessageHandler) {
        ws.off('message', (ws as any)._broadcastMessageHandler);
        delete (ws as any)._broadcastMessageHandler;
      }
      
      // Remove close handler
      if ((ws as any)._broadcastCloseHandler) {
        ws.off('close', (ws as any)._broadcastCloseHandler);
        delete (ws as any)._broadcastCloseHandler;
      }
      
      // Remove error handler
      if ((ws as any)._broadcastErrorHandler) {
        ws.off('error', (ws as any)._broadcastErrorHandler);
        delete (ws as any)._broadcastErrorHandler;
      }
    } catch (error) {
      console.error('❌ FIXED: Error cleaning up client handlers:', error);
    }
  }
  
  // CRITICAL FIX: Handle client disconnection with proper cleanup
  private handleClientDisconnection(ws: WebSocket): void {
    console.log('🔌 FIXED: Handling client disconnection with proper cleanup');
    
    // Find which simulation this client was subscribed to
    const subscription = this.clientSubscriptions.get(ws);
    if (subscription && subscription.simulationId) {
      this.removeClient(subscription.simulationId, ws);
    } else {
      // Clean up from general subscriptions
      this.clientSubscriptions.delete(ws);
    }
    
    // Also clean up from any simulation client sets (safety measure)
    this.simulationClients.forEach((clients, simulationId) => {
      if (clients.has(ws)) {
        console.log(`🧹 FIXED: Removing disconnected client from simulation ${simulationId}`);
        clients.delete(ws);
        if (clients.size === 0) {
          this.simulationClients.delete(simulationId);
        }
      }
    });
    
    this.cleanupClientHandlers(ws);
  }
  
  private handleSubscription(ws: WebSocket, simulationId: string): void {
    console.log(`📡 FIXED: Handling subscription to simulation ${simulationId}`);
    
    // Update existing subscription or add new one
    const existingSubscription = this.clientSubscriptions.get(ws);
    if (existingSubscription) {
      // Remove from old simulation if different
      if (existingSubscription.simulationId && existingSubscription.simulationId !== simulationId) {
        this.removeClient(existingSubscription.simulationId, ws);
      }
    }
    
    // Add to new simulation
    this.addClient(simulationId, ws);
    
    console.log(`📡 FIXED: Client subscribed to simulation ${simulationId}`);
  }
  
  // Enhanced broadcast to simulation with fixed client management
  broadcastToSimulation(simulationId: string, message: any): void {
    // Use sendImmediateUpdate for important messages like trades
    if (message.event && (message.event.type === 'trade' || message.event.type === 'price_update')) {
      this.sendImmediateUpdate(simulationId, message.event);
    } else {
      // For other messages, use the queue
      this.queueUpdate(simulationId, message.event || message);
    }
  }
  
  queueUpdate(simulationId: string, update: any): void {
    // Check if this is an immediate update type
    if (this.immediateTypes.has(update.type)) {
      // Send immediately without batching
      this.sendImmediateUpdate(simulationId, update);
      return;
    }
    
    // Otherwise queue for batching
    if (!this.updateBuffer.has(simulationId)) {
      this.updateBuffer.set(simulationId, []);
    }
    
    const buffer = this.updateBuffer.get(simulationId)!;
    
    // Convert update to message format with validation
    const message: UpdateMessage = {
      type: update.type || 'update',
      data: this.sanitizeData(update.data || update),
      timestamp: update.timestamp || Date.now(),
      priority: update.priority || 0
    };
    
    buffer.push(message);
    
    // Limit buffer size to prevent memory issues
    if (buffer.length > this.broadcastBatchSize * 2) {
      // Keep only the most recent updates
      this.updateBuffer.set(
        simulationId,
        buffer.slice(-this.broadcastBatchSize)
      );
    }
  }
  
  // CRITICAL FIX: Enhanced immediate update with fixed client targeting
  private sendImmediateUpdate(simulationId: string, update: any): void {
    // CRITICAL FIX: Ensure the message structure matches frontend expectations
    const message = {
      simulationId,
      event: {
        type: update.type,
        timestamp: update.timestamp || Date.now(),
        data: this.sanitizeData(update.data || {})
      }
    };
    
    // CRITICAL FIX: Use fixed client management
    const subscribers: WebSocket[] = [];
    
    // Get clients from simulation clients map
    const simulationClients = this.simulationClients.get(simulationId);
    if (simulationClients) {
      simulationClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          subscribers.push(client);
        } else {
          // Clean up dead connections
          simulationClients.delete(client);
          this.clientSubscriptions.delete(client);
        }
      });
    }
    
    // Also check client subscriptions for backward compatibility
    this.clientSubscriptions.forEach((subscription, client) => {
      if (subscription.simulationId === simulationId && 
          client.readyState === WebSocket.OPEN &&
          !subscribers.includes(client)) {
        subscribers.push(client);
      }
    });
    
    if (subscribers.length === 0) {
      return;
    }
    
    // CRITICAL FIX: Safe JSON serialization
    const result = this.safeStringify(message);
    if (!result.success) {
      console.error('❌ FIXED: Failed to serialize immediate update:', result.error);
      return;
    }
    
    console.log(`📤 FIXED: Sending immediate update to ${subscribers.length} clients:`, {
      simulationId,
      eventType: update.type,
      messageSize: result.data!.length,
      timestamp: new Date().toISOString()
    });
    
    // Send to each subscriber immediately as TEXT FRAME
    subscribers.forEach(client => {
      try {
        // CRITICAL: Send with explicit text frame options
        client.send(result.data!, {
          binary: false,     // Explicitly specify text frame
          compress: false,   // Disable compression to prevent binary interpretation
          fin: true         // Complete frame
        });
        
        const subscription = this.clientSubscriptions.get(client);
        if (subscription) {
          subscription.lastUpdate = Date.now();
          subscription.messageCount++;
        }
        this.metrics.totalMessagesSent++;
        this.metrics.textFramesSent++;
      } catch (error) {
        console.error('❌ FIXED: Error sending immediate update to client:', error);
        this.handleClientDisconnection(client);
      }
    });
  }
  
  // CRITICAL FIX: Completely rewritten flushUpdates with proper error handling
  private async flushUpdates(): Promise<void> {
    if (this.updateBuffer.size === 0) return;
    
    const startTime = Date.now();
    
    // Process each simulation's updates
    for (const [simulationId, updates] of this.updateBuffer.entries()) {
      if (updates.length === 0) continue;
      
      try {
        // Sort by priority (higher priority first)
        updates.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        // CRITICAL FIX: Create clean batch data without type conflicts
        const batchData = this.createCleanBatchData(updates);
        
        // CRITICAL FIX: Create the message in the correct format frontend expects
        const message = {
          simulationId,
          event: {
            type: 'batch_update',
            timestamp: Date.now(),
            data: batchData  // Clean data without conflicting types
          }
        };
        
        // CRITICAL FIX: Validate message before sending
        const validationResult = this.validateBatchMessage(message);
        if (!validationResult.valid) {
          console.error('❌ FIXED: Batch message validation failed:', validationResult.error);
          this.metrics.corruptedBatches++;
          continue;
        }
        
        // Send to subscribed clients
        await this.broadcastToSubscribers(simulationId, message);
        
        this.metrics.totalBatchesSent++;
        
      } catch (error) {
        console.error('❌ FIXED: Error processing batch updates for simulation', simulationId, error);
        this.metrics.corruptedBatches++;
      }
    }
    
    // Clear the buffer
    this.updateBuffer.clear();
    
    this.metrics.lastFlushTime = Date.now();
    const flushDuration = Date.now() - startTime;
    
    // Warn if flush is taking too long
    if (flushDuration > this.broadcastIntervalMs * 0.8) {
      console.warn(`⚠️ FIXED: Broadcast flush took ${flushDuration}ms, approaching interval limit`);
    }
  }
  
  // CRITICAL FIX: Clean batch data creation without type conflicts
  private createCleanBatchData(updates: UpdateMessage[]): any {
    // Group updates by type
    const grouped = new Map<string, any[]>();
    
    updates.forEach(update => {
      if (!grouped.has(update.type)) {
        grouped.set(update.type, []);
      }
      // CRITICAL FIX: Ensure data is clean and serializable
      const cleanData = this.sanitizeData(update.data);
      grouped.get(update.type)!.push(cleanData);
    });
    
    // CRITICAL FIX: Create clean structure WITHOUT conflicting type field
    const batchData: any = {
      updates: {},
      updateCount: updates.length,
      batchTimestamp: Date.now()
      // REMOVED: type: 'batch_update' - this was causing conflicts!
    };
    
    for (const [type, items] of grouped.entries()) {
      switch (type) {
        case 'price_update':
          // For price updates, only keep the latest
          batchData.updates.price = items[items.length - 1];
          break;
          
        case 'trade':
        case 'processed_trade':
          // For trades, include all
          if (!batchData.updates.trades) {
            batchData.updates.trades = [];
          }
          batchData.updates.trades.push(...items);
          break;
          
        case 'position_open':
        case 'position_close':
          // For positions, include all
          if (!batchData.updates.positions) {
            batchData.updates.positions = [];
          }
          batchData.updates.positions.push(...items.map(item => ({
            ...item,
            action: type
          })));
          break;
          
        case 'order_book':
          // For order book, only keep the latest
          batchData.updates.orderBook = items[items.length - 1];
          break;
          
        case 'external_market_metrics':
          // For metrics, only keep the latest
          batchData.updates.externalMarketMetrics = items[items.length - 1];
          break;
          
        default:
          // For other types, include all
          batchData.updates[type] = items;
      }
    }
    
    return batchData;
  }
  
  // CRITICAL FIX: Data sanitization to prevent serialization issues
  private sanitizeData(data: any): any {
    if (data === null || data === undefined) {
      return {};
    }
    
    // Handle primitive types
    if (typeof data !== 'object') {
      return data;
    }
    
    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }
    
    // Handle objects
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip functions, undefined values, and symbols
      if (typeof value === 'function' || 
          typeof value === 'symbol' || 
          value === undefined) {
        continue;
      }
      
      // Handle nested objects recursively
      if (typeof value === 'object' && value !== null) {
        // Prevent circular references
        try {
          JSON.stringify(value);
          sanitized[key] = this.sanitizeData(value);
        } catch (error) {
          console.warn(`⚠️ FIXED: Skipping non-serializable value for key: ${key}`);
          sanitized[key] = '[Non-serializable]';
        }
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  // CRITICAL FIX: Safe JSON stringification with error handling
  private safeStringify(obj: any): { success: boolean; data?: string; error?: string } {
    try {
      const jsonString = JSON.stringify(obj);
      
      // Additional validation
      if (typeof jsonString !== 'string') {
        return { success: false, error: 'JSON.stringify did not return a string' };
      }
      
      if (jsonString.length === 0) {
        return { success: false, error: 'JSON.stringify returned empty string' };
      }
      
      // Test that it can be parsed back
      JSON.parse(jsonString);
      
      return { success: true, data: jsonString };
    } catch (error) {
      this.metrics.serializationErrors++;
      return { 
        success: false, 
        error: `JSON serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
  
  // CRITICAL FIX: Batch message validation
  private validateBatchMessage(message: any): { valid: boolean; error?: string } {
    // Check basic structure
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Message is not an object' };
    }
    
    if (!message.simulationId) {
      return { valid: false, error: 'Missing simulationId' };
    }
    
    if (!message.event || typeof message.event !== 'object') {
      return { valid: false, error: 'Missing or invalid event object' };
    }
    
    if (message.event.type !== 'batch_update') {
      return { valid: false, error: 'Event type is not batch_update' };
    }
    
    if (!message.event.data || typeof message.event.data !== 'object') {
      return { valid: false, error: 'Missing or invalid event data' };
    }
    
    // Check data structure
    const data = message.event.data;
    if (!data.updates || typeof data.updates !== 'object') {
      return { valid: false, error: 'Missing or invalid updates object' };
    }
    
    if (typeof data.updateCount !== 'number') {
      return { valid: false, error: 'Missing or invalid updateCount' };
    }
    
    // Test serialization
    const serializationResult = this.safeStringify(message);
    if (!serializationResult.success) {
      return { valid: false, error: `Serialization test failed: ${serializationResult.error}` };
    }
    
    // Check message size (warn if too large)
    const messageSize = serializationResult.data!.length;
    if (messageSize > 1024 * 1024) { // 1MB limit
      console.warn(`⚠️ FIXED: Large batch message: ${messageSize} bytes`);
    }
    
    return { valid: true };
  }
  
  // CRITICAL FIX: Enhanced broadcast to subscribers with proper validation
  private async broadcastToSubscribers(simulationId: string, message: any): Promise<void> {
    const subscribers: WebSocket[] = [];
    
    // CRITICAL FIX: Use fixed client management
    const simulationClients = this.simulationClients.get(simulationId);
    if (simulationClients) {
      simulationClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          subscribers.push(client);
        }
      });
    }
    
    // Also check client subscriptions for backward compatibility
    this.clientSubscriptions.forEach((subscription, client) => {
      if (subscription.simulationId === simulationId && 
          client.readyState === WebSocket.OPEN &&
          !subscribers.includes(client)) {
        subscribers.push(client);
      }
    });
    
    if (subscribers.length === 0) return;
    
    // CRITICAL FIX: Safe serialization with validation
    const serializationResult = this.safeStringify(message);
    if (!serializationResult.success) {
      console.error('❌ FIXED: Failed to serialize batch message:', serializationResult.error);
      this.metrics.corruptedBatches++;
      return;
    }
    
    const jsonMessage = serializationResult.data!;
    
    console.log(`📤 FIXED: Broadcasting batch update to ${subscribers.length} clients:`, {
      simulationId,
      messageSize: jsonMessage.length,
      eventType: message.event.type,
      updateCount: message.event.data.updateCount
    });
    
    // Send to each subscriber as TEXT FRAME
    subscribers.forEach(client => {
      try {
        // CRITICAL: Send with explicit text frame options
        client.send(jsonMessage, {
          binary: false,     // Explicitly specify text frame
          compress: false,   // Disable compression to prevent binary interpretation
          fin: true         // Complete frame
        });
        
        const subscription = this.clientSubscriptions.get(client);
        if (subscription) {
          subscription.lastUpdate = Date.now();
          subscription.messageCount++;
        }
        
        this.metrics.totalMessagesSent++;
        this.metrics.textFramesSent++;
      } catch (error) {
        console.error('❌ FIXED: Error sending batch to client:', error);
        // Remove failed client
        this.handleClientDisconnection(client);
      }
    });
  }
  
  // CRITICAL FIX: Enhanced broadcast to all with explicit text frames and null safety
  broadcastToAll(message: any): void {
    // CRITICAL FIX: Check if WebSocket server is available
    if (!this.wss || !this.wss.clients) {
      console.warn('⚠️ FIXED: WebSocket server not available for broadcast to all');
      return;
    }
    
    // CRITICAL FIX: Ensure message has proper structure
    const formattedMessage = {
      simulationId: message.simulationId || 'broadcast',
      event: {
        type: message.type || 'broadcast',
        timestamp: message.timestamp || Date.now(),
        data: this.sanitizeData(message.data || message)
      }
    };
    
    const serializationResult = this.safeStringify(formattedMessage);
    if (!serializationResult.success) {
      console.error('❌ FIXED: Failed to serialize broadcast message:', serializationResult.error);
      return;
    }
    
    const jsonMessage = serializationResult.data!;
    
    console.log('📤 FIXED: Broadcasting to all clients:', {
      messageSize: jsonMessage.length,
      eventType: formattedMessage.event.type,
      totalClients: this.wss.clients.size
    });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          // CRITICAL: Send with explicit text frame options
          client.send(jsonMessage, {
            binary: false,     // Explicitly specify text frame
            compress: false,   // Disable compression to prevent binary interpretation
            fin: true         // Complete frame
          });
          this.metrics.totalMessagesSent++;
          this.metrics.textFramesSent++;
        } catch (error) {
          console.error('❌ FIXED: Error broadcasting to all:', error);
        }
      }
    });
  }
  
  // CRITICAL FIX: Enhanced direct send method with explicit text frames
  sendDirectMessage(simulationId: string, event: any): void {
    const message = {
      simulationId,
      event: {
        type: event.type,
        timestamp: event.timestamp || Date.now(),
        data: this.sanitizeData(event.data || {})
      }
    };
    
    const subscribers: WebSocket[] = [];
    
    // CRITICAL FIX: Use fixed client management
    const simulationClients = this.simulationClients.get(simulationId);
    if (simulationClients) {
      simulationClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          subscribers.push(client);
        }
      });
    }
    
    // Also check client subscriptions for backward compatibility
    this.clientSubscriptions.forEach((subscription, client) => {
      if (subscription.simulationId === simulationId && 
          client.readyState === WebSocket.OPEN &&
          !subscribers.includes(client)) {
        subscribers.push(client);
      }
    });
    
    if (subscribers.length === 0) {
      return;
    }
    
    const serializationResult = this.safeStringify(message);
    if (!serializationResult.success) {
      console.error('❌ FIXED: Failed to serialize direct message:', serializationResult.error);
      return;
    }
    
    const jsonMessage = serializationResult.data!;
    
    console.log(`📤 FIXED: Sending direct message to ${subscribers.length} clients:`, {
      simulationId,
      eventType: event.type,
      messageSize: jsonMessage.length
    });
    
    subscribers.forEach(client => {
      try {
        // CRITICAL: Send with explicit text frame options
        client.send(jsonMessage, {
          binary: false,     // Explicitly specify text frame
          compress: false,   // Disable compression to prevent binary interpretation
          fin: true         // Complete frame
        });
        
        const subscription = this.clientSubscriptions.get(client);
        if (subscription) {
          subscription.lastUpdate = Date.now();
          subscription.messageCount++;
        }
        this.metrics.totalMessagesSent++;
        this.metrics.textFramesSent++;
      } catch (error) {
        console.error('❌ FIXED: Error sending direct message:', error);
        this.handleClientDisconnection(client);
      }
    });
  }
  
  private calculateMetrics(): void {
    let totalQueueDepth = 0;
    this.updateBuffer.forEach(buffer => {
      totalQueueDepth += buffer.length;
    });
    
    this.metrics.averageQueueDepth = this.updateBuffer.size > 0 ? 
      totalQueueDepth / this.updateBuffer.size : 0;
  }
  
  // CRITICAL FIX: Enhanced statistics with NULL SAFETY
  getStats() {
    // CRITICAL FIX: Add comprehensive null safety checks
    const webSocketServerAvailable = !!(this.wss && this.wss.clients);
    const connectedClients = webSocketServerAvailable ? this.wss!.clients.size : 0;
    
    console.log('📊 FIXED: Getting stats with null safety:', {
      webSocketServerAvailable,
      connectedClients,
      activeSubscriptions: this.clientSubscriptions.size,
      simulationClients: this.simulationClients.size
    });
    
    const stats = {
      // CRITICAL FIX: Use safe client count
      connectedClients: connectedClients,
      activeSubscriptions: this.clientSubscriptions.size,
      simulationClients: this.simulationClients.size,
      bufferedUpdates: 0,
      subscriptionsBySimulation: new Map<string, number>(),
      messagesSent: this.metrics.totalMessagesSent,
      batchesSent: this.metrics.totalBatchesSent,
      averageQueueDepth: this.metrics.averageQueueDepth,
      broadcastIntervalMs: this.broadcastIntervalMs,
      averageMessagesPerClient: new Map<string, number>(),
      compressionEnabled: this.compressionEnabled, // Always false now
      textFramesSent: this.metrics.textFramesSent,
      binaryFramesSent: this.metrics.binaryFramesSent,
      textFramePercentage: this.metrics.totalMessagesSent > 0 ? 
        ((this.metrics.textFramesSent / this.metrics.totalMessagesSent) * 100).toFixed(1) + '%' : '0%',
      serializationErrors: this.metrics.serializationErrors,
      corruptedBatches: this.metrics.corruptedBatches,
      corruptionRate: this.metrics.totalBatchesSent > 0 ? 
        ((this.metrics.corruptedBatches / this.metrics.totalBatchesSent) * 100).toFixed(2) + '%' : '0%',
      clientsAdded: this.metrics.clientsAdded,
      clientsRemoved: this.metrics.clientsRemoved,
      connectionErrors: this.metrics.connectionErrors,
      
      // CRITICAL FIX: Add WebSocket server status
      webSocketServerStatus: webSocketServerAvailable ? 'available' : 'not_available',
      webSocketServerAvailable: webSocketServerAvailable,
      nullSafetyApplied: true,
      
      clientManagement: {
        addClientAvailable: true,
        removeClientAvailable: true,
        interfaceFixed: true,
        nullSafetyApplied: true
      }
    };
    
    // Count buffered updates
    this.updateBuffer.forEach((updates) => {
      stats.bufferedUpdates += updates.length;
    });
    
    // Count subscriptions by simulation using fixed tracking
    this.simulationClients.forEach((clients, simulationId) => {
      stats.subscriptionsBySimulation.set(simulationId, clients.size);
    });
    
    // Also include from client subscriptions for backward compatibility
    this.clientSubscriptions.forEach((subscription) => {
      if (subscription.simulationId) {
        const current = stats.subscriptionsBySimulation.get(subscription.simulationId) || 0;
        stats.subscriptionsBySimulation.set(subscription.simulationId, Math.max(current, 1));
        
        // Track average messages per client
        const avgCount = stats.averageMessagesPerClient.get(subscription.simulationId) || 0;
        const count = stats.subscriptionsBySimulation.get(subscription.simulationId) || 1;
        const newAvg = (avgCount * (count - 1) + subscription.messageCount) / count;
        stats.averageMessagesPerClient.set(subscription.simulationId, newAvg);
      }
    });
    
    return stats;
  }
  
  // Update broadcast settings
  updateSettings(settings: {
    compressionEnabled?: boolean;
    broadcastIntervalMs?: number;
    broadcastBatchSize?: number;
  }): void {
    // Ignore compression settings - always disabled
    if (settings.compressionEnabled !== undefined) {
      console.log('⚠️ FIXED: Compression setting ignored - compression disabled to prevent Blob issues');
    }
    
    if (settings.broadcastIntervalMs !== undefined) {
      // Restart interval with new timing
      clearInterval(this.broadcastInterval);
      this.broadcastIntervalMs = settings.broadcastIntervalMs;
      this.broadcastInterval = setInterval(() => {
        this.flushUpdates();
      }, this.broadcastIntervalMs);
      console.log(`🔄 FIXED: Broadcast interval updated to ${this.broadcastIntervalMs}ms`);
    }
    
    if (settings.broadcastBatchSize !== undefined) {
      this.broadcastBatchSize = settings.broadcastBatchSize;
    }
  }
  
  // Enhanced debug method with fixed client tracking
  debugSubscriptions(): void {
    const webSocketServerAvailable = !!(this.wss && this.wss.clients);
    
    console.log('=== BroadcastManager Debug (NULL SAFETY APPLIED) ===');
    console.log('WebSocket server available:', webSocketServerAvailable);
    console.log('Total WebSocket clients:', webSocketServerAvailable ? this.wss!.clients.size : 0);
    console.log('Active subscriptions:', this.clientSubscriptions.size);
    console.log('Simulation clients:', this.simulationClients.size);
    console.log('Messages sent:', this.metrics.totalMessagesSent);
    console.log('Text frames sent:', this.metrics.textFramesSent);
    console.log('Binary frames sent:', this.metrics.binaryFramesSent);
    console.log('Batches sent:', this.metrics.totalBatchesSent);
    console.log('Clients added:', this.metrics.clientsAdded);
    console.log('Clients removed:', this.metrics.clientsRemoved);
    console.log('Connection errors:', this.metrics.connectionErrors);
    console.log('Serialization errors:', this.metrics.serializationErrors);
    console.log('Corrupted batches:', this.metrics.corruptedBatches);
    console.log('Corruption rate:', this.metrics.totalBatchesSent > 0 ? 
      ((this.metrics.corruptedBatches / this.metrics.totalBatchesSent) * 100).toFixed(2) + '%' : '0%');
    console.log('Average queue depth:', this.metrics.averageQueueDepth.toFixed(2));
    console.log('Compression enabled:', this.compressionEnabled); // Always false
    
    console.log('Simulation clients by ID:');
    this.simulationClients.forEach((clients, simId) => {
      console.log(`  ${simId}: ${clients.size} clients`);
    });
    
    console.log('Client subscriptions:');
    this.clientSubscriptions.forEach((subscription, client) => {
      console.log(`  Client subscribed to: ${subscription.simulationId}, messages: ${subscription.messageCount}, ready: ${client.readyState === WebSocket.OPEN}`);
    });
    
    console.log('Buffered updates by simulation:');
    this.updateBuffer.forEach((updates, simId) => {
      console.log(`  ${simId}: ${updates.length} updates`);
    });
    
    console.log('Immediate update types:', Array.from(this.immediateTypes).join(', '));
    console.log('Interface methods available:');
    console.log('  - addClient: ✅ FIXED');
    console.log('  - removeClient: ✅ FIXED');
    console.log('  - registerClient: ✅ Enhanced');
    console.log('  - getStats: ✅ NULL SAFETY APPLIED');
  }
  
  // Test broadcast functionality with fixed interface
  testBroadcast(simulationId: string): void {
    const testEvent = {
      type: 'test_broadcast',
      timestamp: Date.now(),
      data: {
        message: 'Test broadcast from NULL SAFE BroadcastManager',
        time: new Date().toISOString(),
        metrics: this.getStats(),
        interfaceTests: {
          addClientMethod: 'available',
          removeClientMethod: 'available',
          clientTracking: 'fixed',
          errorHandling: 'enhanced',
          nullSafety: 'applied'
        }
      }
    };
    
    console.log(`🧪 FIXED: Sending test broadcast to simulation ${simulationId} with null safety`);
    this.sendImmediateUpdate(simulationId, testEvent);
  }
  
  // CRITICAL FIX: Health check method with null safety
  healthCheck(): { healthy: boolean; issues: string[]; stats: any } {
    const stats = this.getStats();
    const issues: string[] = [];
    
    // Check WebSocket server availability
    if (!this.wss || !this.wss.clients) {
      issues.push('WebSocket server not available');
    }
    
    // Check for interface issues
    if (this.metrics.connectionErrors > this.metrics.clientsAdded * 0.1) {
      issues.push('High connection error rate');
    }
    
    if (this.metrics.serializationErrors > 0) {
      issues.push('Serialization errors detected');
    }
    
    if (this.metrics.corruptedBatches > this.metrics.totalBatchesSent * 0.05) {
      issues.push('High batch corruption rate');
    }
    
    // Check client tracking consistency
    const simulationClientCount = Array.from(this.simulationClients.values())
      .reduce((sum, clients) => sum + clients.size, 0);
    const subscriptionCount = this.clientSubscriptions.size;
    
    if (Math.abs(simulationClientCount - subscriptionCount) > subscriptionCount * 0.1) {
      issues.push('Client tracking inconsistency detected');
    }
    
    return {
      healthy: issues.length === 0,
      issues,
      stats
    };
  }
  
  // Cleanup with null safety
  shutdown(): void {
    console.log('🔄 FIXED: BroadcastManager shutting down with null safety...');
    
    clearInterval(this.broadcastInterval);
    this.updateBuffer.clear();
    
    // Clean up all client handlers
    this.clientSubscriptions.forEach((subscription, client) => {
      this.cleanupClientHandlers(client);
    });
    
    this.clientSubscriptions.clear();
    this.simulationClients.clear();
    
    console.log('🔄 FIXED: BroadcastManager shut down with null safety');
    console.log(`📊 FIXED: Final stats: ${this.metrics.totalMessagesSent} messages sent, ${this.metrics.textFramesSent} text frames, ${this.metrics.totalBatchesSent} batches sent, ${this.metrics.corruptedBatches} corrupted batches, ${this.metrics.clientsAdded} clients added, ${this.metrics.clientsRemoved} clients removed`);
  }
}