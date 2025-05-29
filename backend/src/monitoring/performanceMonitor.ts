// backend/src/monitoring/performanceMonitor.ts
export class PerformanceMonitor {
  private isMonitoring: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metrics: {
    simulationTicks: number[];
    memoryUsage: number[];
    cpuUsage: number[];
    webSocketConnections: number[];
  } = {
    simulationTicks: [],
    memoryUsage: [],
    cpuUsage: [],
    webSocketConnections: []
  };
  private interval: number = 30000; // Default 30 seconds

  startMonitoring(interval?: number): void {
    if (this.isMonitoring) return;
    
    if (interval) {
      this.interval = interval;
    }
    
    this.isMonitoring = true;
    console.log('Performance monitoring started');
    
    // Monitor at specified interval
    this.monitoringInterval = setInterval(() => {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage.push(memUsage.heapUsed / 1024 / 1024); // MB
      
      // Keep only last 100 entries
      if (this.metrics.memoryUsage.length > 100) {
        this.metrics.memoryUsage.shift();
      }
      
      // Log if memory usage is high
      if (memUsage.heapUsed / 1024 / 1024 > 500) {
        console.warn(`High memory usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      }
    }, this.interval);
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Performance monitoring stopped');
  }

  recordSimulationTick(duration: number): void {
    this.metrics.simulationTicks.push(duration);
    
    // Keep only last 1000 ticks
    if (this.metrics.simulationTicks.length > 1000) {
      this.metrics.simulationTicks.shift();
    }
    
    // Warn if tick is taking too long
    if (duration > 100) {
      console.warn(`Slow simulation tick: ${duration.toFixed(2)}ms`);
    }
  }

  recordWebSocketConnection(count: number): void {
    this.metrics.webSocketConnections.push(count);
    
    // Keep only last 100 entries
    if (this.metrics.webSocketConnections.length > 100) {
      this.metrics.webSocketConnections.shift();
    }
  }

  getMetrics() {
    const avgTickDuration = this.metrics.simulationTicks.length > 0
      ? this.metrics.simulationTicks.reduce((a, b) => a + b, 0) / this.metrics.simulationTicks.length
      : 0;
    
    const avgMemoryUsage = this.metrics.memoryUsage.length > 0
      ? this.metrics.memoryUsage.reduce((a, b) => a + b, 0) / this.metrics.memoryUsage.length
      : 0;
    
    const currentConnections = this.metrics.webSocketConnections.length > 0
      ? this.metrics.webSocketConnections[this.metrics.webSocketConnections.length - 1]
      : 0;
    
    return {
      avgTickDuration,
      avgMemoryUsage,
      totalTicks: this.metrics.simulationTicks.length,
      currentMemoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      webSocketConnections: currentConnections,
      uptime: process.uptime()
    };
  }

  exportMetrics(format: 'prometheus' | 'json' = 'json'): string {
    const metrics = this.getMetrics();
    
    if (format === 'prometheus') {
      // Prometheus format
      return `# HELP node_memory_usage_bytes Memory usage in bytes
# TYPE node_memory_usage_bytes gauge
node_memory_usage_bytes ${metrics.currentMemoryUsage * 1024 * 1024}

# HELP simulation_tick_duration_ms Average simulation tick duration in milliseconds
# TYPE simulation_tick_duration_ms gauge
simulation_tick_duration_ms ${metrics.avgTickDuration}

# HELP websocket_connections Active WebSocket connections
# TYPE websocket_connections gauge
websocket_connections ${metrics.webSocketConnections}

# HELP process_uptime_seconds Process uptime in seconds
# TYPE process_uptime_seconds counter
process_uptime_seconds ${metrics.uptime}`.trim();
    } else {
      // JSON format
      return JSON.stringify(metrics, null, 2);
    }
  }
}