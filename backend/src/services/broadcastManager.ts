// backend/src/services/broadcastManager.ts
import { WebSocket, WebSocketServer } from 'ws';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

interface UpdateMessage {
  type: string;
  data: any;
  timestamp: number;
}

interface ClientSubscription {
  simulationId: string;
  lastUpdate: number;
  compressionEnabled: boolean;
}

export class BroadcastManager {
  private updateBuffer: Map<string, UpdateMessage[]> = new Map();
  private broadcastInterval: NodeJS.Timeout;
  private compressionEnabled: boolean = false; // Disable compression initially
  private clientSubscriptions: Map<WebSocket, ClientSubscription> = new Map();
  private broadcastBatchSize: number = 50;
  private broadcastIntervalMs: number = 50; // 50ms = 20 updates per second
  private immediateTypes = new Set(['price_update', 'trade', 'simulation_status', 'simulation_reset']);
  
  constructor(private wss: WebSocketServer) {
    // Start the broadcast interval for batched updates
    this.broadcastInterval = setInterval(() => {
      this.flushUpdates();
    }, this.broadcastIntervalMs);
    
    // Don't setup WebSocket handlers here - they're handled in websocket/index.ts
    console.log('BroadcastManager initialized');
  }
  
  // Register a client that's already connected
  registerClient(ws: WebSocket, simulationId?: string) {
    // Don't re-register if already exists
    if (this.clientSubscriptions.has(ws)) {
      console.log('Client already registered in BroadcastManager');
      return;
    }
    
    this.clientSubscriptions.set(ws, {
      simulationId: simulationId || '',
      lastUpdate: Date.now(),
      compressionEnabled: false
    });
    
    // Listen for subscription messages
    const messageHandler = (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'subscribe') {
          this.handleSubscription(ws, message.simulationId);
        } else if (message.type === 'compression') {
          this.handleCompressionToggle(ws, message.enabled);
        }
      } catch (error) {
        // Ignore parsing errors as they might be handled elsewhere
      }
    };
    
    // Store the handler so we can remove it later
    (ws as any)._broadcastMessageHandler = messageHandler;
    ws.on('message', messageHandler);
    
    // Clean up on close
    ws.on('close', () => {
      this.clientSubscriptions.delete(ws);
      // Remove the message handler
      if ((ws as any)._broadcastMessageHandler) {
        ws.off('message', (ws as any)._broadcastMessageHandler);
        delete (ws as any)._broadcastMessageHandler;
      }
    });
    
    console.log('Client registered in BroadcastManager');
  }
  
  private handleSubscription(ws: WebSocket, simulationId: string) {
    const subscription = this.clientSubscriptions.get(ws);
    if (subscription) {
      subscription.simulationId = simulationId;
      subscription.lastUpdate = Date.now();
      console.log(`BroadcastManager: Client subscribed to simulation ${simulationId}`);
    }
  }
  
  private handleCompressionToggle(ws: WebSocket, enabled: boolean) {
    const subscription = this.clientSubscriptions.get(ws);
    if (subscription) {
      subscription.compressionEnabled = enabled;
      console.log(`Client compression ${enabled ? 'enabled' : 'disabled'}`);
    }
  }
  
  queueUpdate(simulationId: string, update: any) {
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
    
    // Convert update to message format
    const message: UpdateMessage = {
      type: update.type || 'update',
      data: update.data || update,
      timestamp: update.timestamp || Date.now()
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
  
  private sendImmediateUpdate(simulationId: string, update: any) {
    // Format message to match what frontend expects
    const message = {
      simulationId,
      event: update // Keep the original event structure
    };
    
    const subscribers: WebSocket[] = [];
    
    // Find all clients subscribed to this simulation
    this.clientSubscriptions.forEach((subscription, client) => {
      if (subscription.simulationId === simulationId && 
          client.readyState === WebSocket.OPEN) {
        subscribers.push(client);
      }
    });
    
    if (subscribers.length === 0) {
      console.log(`No subscribers for simulation ${simulationId}`);
      return;
    }
    
    const jsonMessage = JSON.stringify(message);
    console.log(`Broadcasting ${update.type} to ${subscribers.length} subscribers`);
    
    // Send to each subscriber immediately
    subscribers.forEach(client => {
      try {
        client.send(jsonMessage);
        const subscription = this.clientSubscriptions.get(client);
        if (subscription) {
          subscription.lastUpdate = Date.now();
        }
      } catch (error) {
        console.error('Error sending immediate update to client:', error);
        this.clientSubscriptions.delete(client);
      }
    });
  }
  
  private async flushUpdates() {
    if (this.updateBuffer.size === 0) return;
    
    // Process each simulation's updates
    for (const [simulationId, updates] of this.updateBuffer.entries()) {
      if (updates.length === 0) continue;
      
      // Merge updates intelligently
      const mergedUpdate = this.mergeUpdates(updates);
      
      // Create the message in the format frontend expects
      const message = {
        simulationId,
        event: {
          type: 'batch_update',
          timestamp: Date.now(),
          data: mergedUpdate.updates
        }
      };
      
      // Send to subscribed clients
      await this.broadcastToSubscribers(simulationId, message);
    }
    
    // Clear the buffer
    this.updateBuffer.clear();
  }
  
  private mergeUpdates(updates: UpdateMessage[]): any {
    // Group updates by type
    const grouped = new Map<string, any[]>();
    
    updates.forEach(update => {
      if (!grouped.has(update.type)) {
        grouped.set(update.type, []);
      }
      grouped.get(update.type)!.push(update.data);
    });
    
    // Merge based on type
    const merged: any = {
      type: 'batch_update',
      updates: {}
    };
    
    for (const [type, items] of grouped.entries()) {
      switch (type) {
        case 'price_update':
          // For price updates, only keep the latest
          merged.updates.price = items[items.length - 1];
          break;
          
        case 'trade':
          // For trades, include all
          merged.updates.trades = items;
          break;
          
        case 'position_open':
        case 'position_close':
          // For positions, include all
          if (!merged.updates.positions) {
            merged.updates.positions = [];
          }
          merged.updates.positions.push(...items.map(item => ({
            ...item,
            action: type
          })));
          break;
          
        case 'order_book':
          // For order book, only keep the latest
          merged.updates.orderBook = items[items.length - 1];
          break;
          
        default:
          // For other types, include all
          merged.updates[type] = items;
      }
    }
    
    return merged;
  }
  
  private async broadcastToSubscribers(simulationId: string, message: any) {
    const subscribers: WebSocket[] = [];
    
    // Find all clients subscribed to this simulation
    this.clientSubscriptions.forEach((subscription, client) => {
      if (subscription.simulationId === simulationId && 
          client.readyState === WebSocket.OPEN) {
        subscribers.push(client);
      }
    });
    
    if (subscribers.length === 0) return;
    
    // Prepare message
    const jsonMessage = JSON.stringify(message);
    
    // Send to each subscriber
    subscribers.forEach(client => {
      try {
        client.send(jsonMessage);
        
        const subscription = this.clientSubscriptions.get(client);
        if (subscription) {
          subscription.lastUpdate = Date.now();
        }
      } catch (error) {
        console.error('Error sending to client:', error);
        // Remove failed client
        this.clientSubscriptions.delete(client);
      }
    });
  }
  
  // Public method to broadcast to all clients (fallback)
  broadcastToAll(message: any) {
    const jsonMessage = JSON.stringify(message);
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(jsonMessage);
        } catch (error) {
          console.error('Error broadcasting to all:', error);
        }
      }
    });
  }
  
  // Get statistics
  getStats() {
    const stats = {
      connectedClients: this.wss.clients.size,
      activeSubscriptions: this.clientSubscriptions.size,
      bufferedUpdates: 0,
      subscriptionsBySimulation: new Map<string, number>()
    };
    
    // Count buffered updates
    this.updateBuffer.forEach((updates) => {
      stats.bufferedUpdates += updates.length;
    });
    
    // Count subscriptions by simulation
    this.clientSubscriptions.forEach((subscription) => {
      if (subscription.simulationId) {
        const count = stats.subscriptionsBySimulation.get(subscription.simulationId) || 0;
        stats.subscriptionsBySimulation.set(subscription.simulationId, count + 1);
      }
    });
    
    return stats;
  }
  
  // Update broadcast settings
  updateSettings(settings: {
    compressionEnabled?: boolean;
    broadcastIntervalMs?: number;
    broadcastBatchSize?: number;
  }) {
    if (settings.compressionEnabled !== undefined) {
      this.compressionEnabled = settings.compressionEnabled;
    }
    
    if (settings.broadcastIntervalMs !== undefined) {
      // Restart interval with new timing
      clearInterval(this.broadcastInterval);
      this.broadcastIntervalMs = settings.broadcastIntervalMs;
      this.broadcastInterval = setInterval(() => {
        this.flushUpdates();
      }, this.broadcastIntervalMs);
    }
    
    if (settings.broadcastBatchSize !== undefined) {
      this.broadcastBatchSize = settings.broadcastBatchSize;
    }
  }
  
  // Debug method to check subscriptions
  debugSubscriptions() {
    console.log('=== BroadcastManager Debug ===');
    console.log('Total WebSocket clients:', this.wss.clients.size);
    console.log('Active subscriptions:', this.clientSubscriptions.size);
    
    this.clientSubscriptions.forEach((subscription, client) => {
      console.log(`Client subscribed to: ${subscription.simulationId}, ready: ${client.readyState === WebSocket.OPEN}`);
    });
    
    console.log('Buffered updates by simulation:');
    this.updateBuffer.forEach((updates, simId) => {
      console.log(`  ${simId}: ${updates.length} updates`);
    });
  }
  
  // Cleanup
  shutdown() {
    clearInterval(this.broadcastInterval);
    this.updateBuffer.clear();
    this.clientSubscriptions.clear();
    console.log('BroadcastManager shut down');
  }
}