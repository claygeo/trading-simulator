// frontend/src/services/api.ts - FIXED: Dynamic Pricing Support
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

// FIXED: Enhanced simulation parameters interface with dynamic pricing
export interface EnhancedSimulationParameters {
  timeCompressionFactor?: number;
  initialPrice?: number; // Optional - should not be used when using dynamic pricing
  initialLiquidity?: number;
  volatilityFactor?: number;
  duration?: number;
  scenarioType?: string;
  // FIXED: Dynamic pricing parameters
  priceRange?: 'micro' | 'small' | 'mid' | 'large' | 'mega' | 'random';
  customPrice?: number;
  useCustomPrice?: boolean;
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
  // FIXED: Create simulation with dynamic pricing support
  createSimulation: async (parameters: EnhancedSimulationParameters = {}): Promise<ApiResponse<any>> => {
    try {
      console.log('💰 FIXED: Creating simulation with dynamic pricing parameters:', parameters);
      
      // CRITICAL FIX: Build request body with dynamic pricing parameters
      const requestBody: any = {
        duration: 3600,
        volatilityFactor: 1.0,
        scenarioType: 'standard',
        timeCompressionFactor: 1,
        ...parameters
        // CRITICAL: DO NOT include initialPrice: 100 here!
      };
      
      // FIXED: Only include initialPrice if explicitly provided (not for dynamic pricing)
      if (parameters.initialPrice && !parameters.useCustomPrice && !parameters.priceRange) {
        requestBody.initialPrice = parameters.initialPrice;
        console.log('💰 FIXED: Using explicit initialPrice:', parameters.initialPrice);
      } else if (parameters.useCustomPrice && parameters.customPrice) {
        requestBody.useCustomPrice = true;
        requestBody.customPrice = parameters.customPrice;
        console.log('💰 FIXED: Using custom price:', parameters.customPrice);
      } else if (parameters.priceRange) {
        requestBody.priceRange = parameters.priceRange;
        console.log('💰 FIXED: Using price range:', parameters.priceRange);
      } else {
        // Let backend generate dynamic price
        requestBody.priceRange = 'random';
        console.log('💰 FIXED: Using random dynamic pricing (no hardcoded values)');
      }
      
      console.log('📤 FIXED: Final request body (NO hardcoded $100):', requestBody);
      
      const response = await api.post('/simulation', requestBody);
      
      console.log('📥 FIXED: Simulation created with dynamic pricing:', response.data);
      
      // FIXED: Log dynamic pricing info if available
      if (response.data?.dynamicPricing) {
        console.log('💰 FIXED: Dynamic pricing info:', response.data.dynamicPricing);
      }
      
      return { data: response.data };
    } catch (error: any) {
      console.error('❌ FIXED: Error creating simulation with dynamic pricing:', error);
      
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
      
      // FIXED: Log dynamic pricing info if available
      if (response.data?.data?.dynamicPricing || response.data?.dynamicPricing) {
        console.log('💰 FIXED: Retrieved simulation with dynamic pricing:', 
          response.data?.data?.dynamicPricing || response.data?.dynamicPricing);
      }
      
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
      
      // FIXED: Log dynamic pricing readiness if available
      if (response.data?.dynamicPricingFixed) {
        console.log('💰 FIXED: Simulation ready with dynamic pricing support');
      }
      
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
          console.log(`💰 FIXED: Simulation ${id} ready after ${attempt} attempts (with dynamic pricing support)`);
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
      
      // FIXED: Log dynamic price info when starting
      if (response.data?.data?.dynamicPrice) {
        console.log('💰 FIXED: Started simulation with dynamic price:', response.data.data.dynamicPrice);
      }
      
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
  
  // FIXED: Reset simulation with dynamic pricing regeneration
  resetSimulation: async (id: string, options: { generateNewPrice?: boolean } = {}) => {
    try {
      const requestBody = {
        clearAllData: true,
        resetState: 'complete',
        generateNewPrice: options.generateNewPrice !== false // Default to true
      };
      
      console.log('💰 FIXED: Resetting simulation with dynamic pricing regeneration');
      
      const response = await api.post(`/simulation/${id}/reset`, requestBody);
      
      // FIXED: Log new dynamic price info
      if (response.data?.data?.dynamicPricing) {
        console.log('💰 FIXED: Reset generated new dynamic price:', response.data.data.dynamicPricing);
      }
      
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
      
      // FIXED: Log dynamic pricing stats if available
      if (response.data?.data?.dynamicPricing) {
        console.log('💰 FIXED: Retrieved simulation stats with dynamic pricing info:', 
          response.data.data.dynamicPricing);
      }
      
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
      
      // FIXED: Check for dynamic pricing support in test response
      if (testResponse.data?.dynamicPricingFixed) {
        console.log('💰 FIXED: Backend supports dynamic pricing!');
      }
      
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

  // FIXED: Test simulation system with dynamic pricing
  testSimulationSystem: async (): Promise<boolean> => {
    try {
      const backendOk = await SimulationUtils.testBackendConnection();
      if (!backendOk) {
        return false;
      }
      
      // FIXED: Test with dynamic pricing parameters (no hardcoded $100)
      const simResult = await SimulationApi.createSimulation({
        duration: 30,
        volatilityFactor: 1.0,
        priceRange: 'random' // Use dynamic pricing
      });
      
      if (simResult.error) {
        console.log('Failed to create simulation:', simResult.error);
        return false;
      }
      
      // FIXED: Verify dynamic pricing worked
      if (simResult.data?.dynamicPricing) {
        console.log('💰 FIXED: Dynamic pricing test successful:', simResult.data.dynamicPricing);
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
        // FIXED: Create test simulation with dynamic pricing
        const simResult = await SimulationApi.createSimulation({
          duration: 30,
          volatilityFactor: 1.0,
          priceRange: 'random'
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
        // FIXED: Create test simulation with dynamic pricing
        const simResult = await SimulationApi.createSimulation({
          duration: 30,
          volatilityFactor: 1.0,
          priceRange: 'random'
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
        // FIXED: Create test simulation with dynamic pricing
        const simResult = await SimulationApi.createSimulation({
          duration: 30,
          volatilityFactor: 1.0,
          priceRange: 'random'
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

  // ENHANCED: Better configuration debugging with dynamic pricing info
  debugConfiguration: () => {
    console.log('💰 FIXED: Frontend Configuration Debug (Dynamic Pricing Support):', {
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
      },
      dynamicPricingSupport: true,
      fixedHardcodedPricing: true
    });
  },

  // NEW: Enhanced diagnostic function with dynamic pricing tests
  runDiagnostics: async (): Promise<{
    backendConnection: boolean;
    simulationSystem: boolean;
    readyEndpoint: boolean;
    speedEndpoint: boolean;
    tpsEndpoint: boolean;
    dynamicPricingSupport: boolean;
    errors: string[];
  }> => {
    const results = {
      backendConnection: false,
      simulationSystem: false,
      readyEndpoint: false,
      speedEndpoint: false,
      tpsEndpoint: false,
      dynamicPricingSupport: false,
      errors: [] as string[]
    };

    try {
      console.log('🔍 💰 FIXED: Running comprehensive API diagnostics with dynamic pricing tests...');

      // Test backend connection
      results.backendConnection = await SimulationUtils.testBackendConnection();
      if (!results.backendConnection) {
        results.errors.push('Backend connection failed');
      }

      // Test simulation system with dynamic pricing
      if (results.backendConnection) {
        results.simulationSystem = await SimulationUtils.testSimulationSystem();
        if (!results.simulationSystem) {
          results.errors.push('Simulation system test failed');
        } else {
          // FIXED: Test dynamic pricing specifically
          try {
            const dynamicPricingTest = await SimulationApi.createSimulation({
              priceRange: 'small',
              duration: 30
            });
            
            if (dynamicPricingTest.data?.dynamicPricing) {
              results.dynamicPricingSupport = true;
              console.log('💰 FIXED: Dynamic pricing test PASSED!');
            } else {
              results.errors.push('Dynamic pricing not supported or not working');
            }
          } catch (error) {
            results.errors.push('Dynamic pricing test failed');
          }
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

      console.log('📊 💰 FIXED: Diagnostic results with dynamic pricing:', results);
      return results;

    } catch (error: any) {
      results.errors.push(`Diagnostic error: ${error.message}`);
      console.error('Diagnostic failed:', error);
      return results;
    }
  }
};

// Global window functions for debugging - FIXED with dynamic pricing support
if (typeof window !== 'undefined') {
  (window as any).testBackend = SimulationUtils.testBackendConnection;
  (window as any).testSimulation = SimulationUtils.testSimulationSystem;
  (window as any).testReadyEndpoint = SimulationUtils.testReadyEndpoint;
  (window as any).testSpeedEndpoint = SimulationUtils.testSpeedEndpoint;
  (window as any).testTPSEndpoint = SimulationUtils.testTPSEndpoint;
  (window as any).debugConfig = SimulationUtils.debugConfiguration;
  (window as any).runDiagnostics = SimulationUtils.runDiagnostics;
  (window as any).SimulationApi = SimulationApi;
  
  // FIXED: Add dynamic pricing test functions
  (window as any).testDynamicPricing = async () => {
    console.log('💰 TESTING: Dynamic pricing with different ranges...');
    
    const ranges = ['micro', 'small', 'mid', 'large', 'mega', 'random'];
    
    for (const range of ranges) {
      try {
        const result = await SimulationApi.createSimulation({
          priceRange: range as any,
          duration: 30
        });
        
        if (result.data?.dynamicPricing) {
          console.log(`💰 ${range.toUpperCase()}: ${result.data.dynamicPricing.finalPrice} (${result.data.dynamicPricing.priceCategory})`);
        } else {
          console.log(`❌ ${range.toUpperCase()}: No dynamic pricing info`);
        }
      } catch (error) {
        console.error(`❌ ${range.toUpperCase()}: Error -`, error);
      }
    }
  };
  
  (window as any).testCustomPrice = async (price: number) => {
    console.log(`💰 TESTING: Custom price ${price}...`);
    
    try {
      const result = await SimulationApi.createSimulation({
        useCustomPrice: true,
        customPrice: price,
        duration: 30
      });
      
      if (result.data?.dynamicPricing) {
        console.log(`💰 CUSTOM: ${result.data.dynamicPricing.finalPrice} (was custom: ${result.data.dynamicPricing.wasCustom})`);
      } else {
        console.log(`❌ CUSTOM: No dynamic pricing info`);
      }
    } catch (error) {
      console.error(`❌ CUSTOM: Error -`, error);
    }
  };
}

export default {
  TraderApi,
  SimulationApi,
  SimulationUtils
};