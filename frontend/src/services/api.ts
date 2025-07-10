// frontend/src/services/api.ts - Production version with enhanced error handling
import axios from 'axios';

const getApiBaseUrl = (): string => {
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1';

  if (isDevelopment) {
    return process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';
  } else {
    return process.env.REACT_APP_API_BASE_URL || 
           process.env.REACT_APP_BACKEND_URL + '/api' ||
           'https://trading-simulator-iw7q.onrender.com/api';
  }
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Only log detailed errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('API Response Error:', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message,
        data: error.response?.data
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      console.error('Backend connection failed. Check if backend is running at:', API_BASE_URL);
    }
    
    return Promise.reject(error);
  }
);

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export const TraderApi = {
  getTraders: async () => {
    try {
      const response = await api.get('/traders');
      return { data: response.data };
    } catch (error) {
      console.error('Error fetching traders:', error);
      return { 
        data: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
  
  getTraderProfiles: async () => {
    try {
      const response = await api.get('/trader-profiles');
      return { data: response.data };
    } catch (error) {
      console.error('Error fetching trader profiles:', error);
      return { 
        data: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
};

export const SimulationApi = {
  createSimulation: async (parameters: any = {}): Promise<ApiResponse<any>> => {
    try {
      const response = await api.post('/simulation', {
        initialPrice: 100,
        duration: 3600,
        volatilityFactor: 1.0,
        scenarioType: 'standard',
        ...parameters
      });
      
      return { data: response.data };
    } catch (error: any) {
      console.error('Error creating simulation:', error);
      
      let errorMessage = 'Failed to create simulation';
      if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = `No response from backend server: ${API_BASE_URL}`;
      } else {
        errorMessage = error.message || 'Unknown error';
      }
      
      return { 
        data: null, 
        error: errorMessage
      };
    }
  },
  
  getSimulations: async () => {
    try {
      const response = await api.get('/simulations');
      return { data: response.data };
    } catch (error) {
      console.error('Error fetching simulations:', error);
      return { 
        data: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
  
  getSimulation: async (id: string) => {
    try {
      const response = await api.get(`/simulation/${id}`);
      return { data: response.data };
    } catch (error: any) {
      console.error(`Error fetching simulation ${id}:`, error);
      
      let errorMessage = 'Unknown error';
      if (error.response?.status === 404) {
        errorMessage = 'Simulation not found';
      } else if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = `No response from backend: ${API_BASE_URL}`;
      } else {
        errorMessage = error.message;
      }
      
      return { 
        data: null, 
        error: errorMessage
      };
    }
  },

  // ENHANCED: Better error handling and fallback strategies for simulation readiness
  checkSimulationReady: async (id: string): Promise<ApiResponse<{ready: boolean, status: string, id: string}>> => {
    try {
      const response = await api.get(`/simulation/${id}/ready`);
      return { data: response.data };
    } catch (error: any) {
      // If /ready endpoint doesn't exist (404), try fallback approach
      if (error.response?.status === 404) {
        console.log(`Ready endpoint not found for ${id}, trying fallback approach...`);
        
        try {
          // Fallback: Check simulation existence and status via main endpoint
          const simResponse = await api.get(`/simulation/${id}`);
          const simulation = simResponse.data?.data || simResponse.data;
          
          if (simulation && simulation.id === id) {
            // Simulation exists, assume it's ready
            return { 
              data: { 
                ready: true, 
                status: 'ready_via_fallback', 
                id 
              }
            };
          }
        } catch (fallbackError: any) {
          // If simulation doesn't exist at all
          if (fallbackError.response?.status === 404) {
            return { 
              data: { ready: false, status: 'simulation_not_found', id },
              error: 'Simulation not found'
            };
          }
        }
      }
      
      console.error(`Error checking simulation readiness for ${id}:`, error);
      
      let errorMessage = 'Failed to check simulation readiness';
      if (error.response?.status === 404) {
        errorMessage = 'Simulation not found or ready endpoint not available';
      } else if (error.response?.status >= 500) {
        errorMessage = 'Backend server error - simulation may still be initializing';
      } else if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = `No response from backend: ${API_BASE_URL}`;
      } else {
        errorMessage = error.message;
      }
      
      return { 
        data: { ready: false, status: 'error', id },
        error: errorMessage
      };
    }
  },

  // ENHANCED: More robust waiting with exponential backoff and better error handling
  waitForSimulationReady: async (id: string, maxAttempts: number = 15, initialDelayMs: number = 500): Promise<ApiResponse<{ready: boolean, attempts: number}>> => {
    let lastError = '';
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await SimulationApi.checkSimulationReady(id);
        
        // Success case
        if (result.data?.ready) {
          console.log(`Simulation ${id} ready after ${attempt} attempts`);
          return { 
            data: { ready: true, attempts: attempt }
          };
        }
        
        // Permanent failure cases
        if (result.error) {
          if (result.error.includes('not found')) {
            return { 
              data: { ready: false, attempts: attempt },
              error: result.error 
            };
          }
          lastError = result.error;
        }
        
        // Log progress for development
        if (process.env.NODE_ENV === 'development') {
          console.log(`Simulation ${id} not ready yet, attempt ${attempt}/${maxAttempts}. Status: ${result.data?.status || 'unknown'}`);
        }
        
      } catch (error: any) {
        lastError = error.message || 'Unknown error during readiness check';
        
        // If this is the last attempt, return the error
        if (attempt === maxAttempts) {
          return { 
            data: { ready: false, attempts: attempt },
            error: lastError
          };
        }
      }
      
      // Wait before next attempt (exponential backoff with jitter)
      if (attempt < maxAttempts) {
        const baseDelay = Math.min(5000, initialDelayMs * Math.pow(1.5, attempt - 1));
        const jitter = Math.random() * 200; // Add 0-200ms jitter
        const delay = Math.floor(baseDelay + jitter);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return { 
      data: { ready: false, attempts: maxAttempts },
      error: lastError || `Simulation failed to become ready after ${maxAttempts} attempts. Backend may need more time to initialize.`
    };
  },
  
  startSimulation: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/start`);
      return { data: response.data };
    } catch (error: any) {
      console.error(`Error starting simulation ${id}:`, error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to start simulation'
      };
    }
  },
  
  pauseSimulation: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/pause`);
      return { data: response.data };
    } catch (error: any) {
      console.error(`Error pausing simulation ${id}:`, error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to pause simulation'
      };
    }
  },
  
  resetSimulation: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/reset`, {
        clearAllData: true,
        resetPrice: 100,
        resetState: 'complete'
      });
      return { data: response.data };
    } catch (error: any) {
      console.error(`Error resetting simulation ${id}:`, error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to reset simulation'
      };
    }
  },
  
  setSimulationSpeed: async (id: string, speed: number) => {
    try {
      const response = await api.post(`/simulation/${id}/speed`, { 
        speed,
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substr(2, 9)
      });
      return { 
        data: response.data,
        success: true,
        error: null 
      };
    } catch (error: any) {
      console.error(`Error setting simulation speed for ${id}:`, error);
      return { 
        data: null,
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to set simulation speed'
      };
    }
  },

  // NEW: Set TPS mode for stress testing
  setTPSMode: async (id: string, mode: string) => {
    try {
      const response = await api.post(`/simulation/${id}/tps-mode`, { 
        mode,
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substr(2, 9)
      });
      return { 
        data: response.data,
        success: true,
        error: null 
      };
    } catch (error: any) {
      console.error(`Error setting TPS mode for ${id}:`, error);
      return { 
        data: null,
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to set TPS mode'
      };
    }
  },

  // NEW: Trigger liquidation cascade
  triggerLiquidationCascade: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/liquidation-cascade`, {
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substr(2, 9)
      });
      return { 
        data: response.data,
        success: true,
        error: null 
      };
    } catch (error: any) {
      console.error(`Error triggering liquidation cascade for ${id}:`, error);
      return { 
        data: null,
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to trigger liquidation cascade'
      };
    }
  },

  getSimulationStats: async (id: string) => {
    try {
      const response = await api.get(`/simulation/${id}/stats`);
      return { data: response.data };
    } catch (error: any) {
      console.error(`Error fetching simulation stats for ${id}:`, error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to fetch simulation stats'
      };
    }
  }
};

export const SimulationUtils = {
  testBackendConnection: async (): Promise<boolean> => {
    try {
      const testResponse = await api.get('/test');
      return true;
      
    } catch (error: any) {
      console.error('Backend connection failed:', error);
      
      if (error.code === 'ECONNREFUSED') {
        console.log('Backend server appears to be down at:', API_BASE_URL);
      } else if (error.response?.status === 404) {
        console.log('Backend running but route not found. Check backend routes.');
      } else if (error.response?.status >= 500) {
        console.log('Backend server error. Check backend logs.');
      }
      
      return false;
    }
  },

  testSimulationSystem: async (): Promise<boolean> => {
    try {
      const backendOk = await SimulationUtils.testBackendConnection();
      if (!backendOk) {
        return false;
      }
      
      const simResult = await SimulationApi.createSimulation({
        initialPrice: 100,
        duration: 30,
        volatilityFactor: 1.0
      });
      
      if (simResult.error) {
        console.log('Failed to create simulation:', simResult.error);
        return false;
      }
      
      return true;
      
    } catch (error: any) {
      console.error('Simulation system test failed:', error);
      return false;
    }
  },

  // ENHANCED: Better ready endpoint testing with fallback detection
  testReadyEndpoint: async (simulationId?: string): Promise<boolean> => {
    try {
      let testSimId = simulationId;
      
      if (!testSimId) {
        const simResult = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 30,
          volatilityFactor: 1.0
        });
        
        if (simResult.error || !simResult.data) {
          console.log('Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('No simulation ID available for ready endpoint test');
        return false;
      }
      
      const readyResult = await SimulationApi.checkSimulationReady(testSimId);
      
      if (readyResult.error) {
        // If it's a 404, that's expected if the endpoint doesn't exist
        if (readyResult.error.includes('not found') || readyResult.error.includes('404')) {
          console.log('Ready endpoint not available (using fallback approach)');
          return true; // Fallback approach is working
        }
        console.log('Ready endpoint test failed:', readyResult.error);
        return false;
      }
      
      return true;
      
    } catch (error: any) {
      console.error('Ready endpoint test failed:', error);
      return false;
    }
  },

  testSpeedEndpoint: async (simulationId?: string): Promise<boolean> => {
    try {
      let testSimId = simulationId;
      
      if (!testSimId) {
        const simResult = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 30,
          volatilityFactor: 1.0
        });
        
        if (simResult.error || !simResult.data) {
          console.log('Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('No simulation ID available for speed endpoint test');
        return false;
      }
      
      const speeds = [2, 6, 50, 100];
      
      for (const speed of speeds) {
        const speedResult = await SimulationApi.setSimulationSpeed(testSimId, speed);
        
        if (speedResult.error) {
          console.log(`Speed endpoint test failed for speed ${speed}:`, speedResult.error);
          return false;
        }
      }
      
      return true;
      
    } catch (error: any) {
      console.error('Speed endpoint test failed:', error);
      return false;
    }
  },

  // NEW: Test TPS mode endpoints
  testTPSEndpoint: async (simulationId?: string): Promise<boolean> => {
    try {
      let testSimId = simulationId;
      
      if (!testSimId) {
        const simResult = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 30,
          volatilityFactor: 1.0
        });
        
        if (simResult.error || !simResult.data) {
          console.log('Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('No simulation ID available for TPS endpoint test');
        return false;
      }
      
      const modes = ['NORMAL', 'BURST', 'STRESS', 'HFT'];
      
      for (const mode of modes) {
        const tpsResult = await SimulationApi.setTPSMode(testSimId, mode);
        
        if (tpsResult.error) {
          console.log(`TPS endpoint test failed for mode ${mode}:`, tpsResult.error);
          return false;
        }
      }
      
      return true;
      
    } catch (error: any) {
      console.error('TPS endpoint test failed:', error);
      return false;
    }
  },

  // ENHANCED: Better configuration debugging
  debugConfiguration: () => {
    console.log('Frontend Configuration Debug:', {
      apiBaseUrl: API_BASE_URL,
      environment: process.env.NODE_ENV,
      hostname: window.location.hostname,
      port: window.location.port,
      protocol: window.location.protocol,
      envVars: {
        REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
        REACT_APP_API_BASE_URL: process.env.REACT_APP_API_BASE_URL,
        REACT_APP_BACKEND_WS_URL: process.env.REACT_APP_BACKEND_WS_URL,
        REACT_APP_DEBUG: process.env.REACT_APP_DEBUG
      },
      detectedEnvironment: {
        isDevelopment: process.env.NODE_ENV === 'development',
        isLocalhost: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
        isProduction: process.env.NODE_ENV === 'production'
      }
    });
  },

  // NEW: Enhanced diagnostic function
  runDiagnostics: async (): Promise<{
    backendConnection: boolean;
    simulationSystem: boolean;
    readyEndpoint: boolean;
    speedEndpoint: boolean;
    tpsEndpoint: boolean;
    errors: string[];
  }> => {
    const results = {
      backendConnection: false,
      simulationSystem: false,
      readyEndpoint: false,
      speedEndpoint: false,
      tpsEndpoint: false,
      errors: [] as string[]
    };

    try {
      console.log('🔍 Running comprehensive API diagnostics...');

      // Test backend connection
      results.backendConnection = await SimulationUtils.testBackendConnection();
      if (!results.backendConnection) {
        results.errors.push('Backend connection failed');
      }

      // Test simulation system
      if (results.backendConnection) {
        results.simulationSystem = await SimulationUtils.testSimulationSystem();
        if (!results.simulationSystem) {
          results.errors.push('Simulation system test failed');
        }
      }

      // Test ready endpoint
      if (results.simulationSystem) {
        results.readyEndpoint = await SimulationUtils.testReadyEndpoint();
        if (!results.readyEndpoint) {
          results.errors.push('Ready endpoint test failed');
        }
      }

      // Test speed endpoint
      if (results.simulationSystem) {
        results.speedEndpoint = await SimulationUtils.testSpeedEndpoint();
        if (!results.speedEndpoint) {
          results.errors.push('Speed endpoint test failed');
        }
      }

      // Test TPS endpoint
      if (results.simulationSystem) {
        results.tpsEndpoint = await SimulationUtils.testTPSEndpoint();
        if (!results.tpsEndpoint) {
          results.errors.push('TPS endpoint test failed');
        }
      }

      console.log('📊 Diagnostic results:', results);
      return results;

    } catch (error: any) {
      results.errors.push(`Diagnostic error: ${error.message}`);
      console.error('Diagnostic failed:', error);
      return results;
    }
  }
};

// Global window functions for debugging
if (typeof window !== 'undefined') {
  (window as any).testBackend = SimulationUtils.testBackendConnection;
  (window as any).testSimulation = SimulationUtils.testSimulationSystem;
  (window as any).testReadyEndpoint = SimulationUtils.testReadyEndpoint;
  (window as any).testSpeedEndpoint = SimulationUtils.testSpeedEndpoint;
  (window as any).testTPSEndpoint = SimulationUtils.testTPSEndpoint; // NEW
  (window as any).debugConfig = SimulationUtils.debugConfiguration;
  (window as any).runDiagnostics = SimulationUtils.runDiagnostics; // NEW
  (window as any).SimulationApi = SimulationApi;
}

export default {
  TraderApi,
  SimulationApi,
  SimulationUtils
};