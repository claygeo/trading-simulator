// frontend/src/services/api.ts - COMPLETE FIXED VERSION WITH READY ENDPOINT
import axios from 'axios';

// FIXED: Determine the correct API base URL based on environment
const getApiBaseUrl = (): string => {
  // Check if we're in development
  const isDevelopment = process.env.NODE_ENV === 'development' || 
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1';

  if (isDevelopment) {
    // Development: Use local backend
    return process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';
  } else {
    // Production: Use Render backend
    return process.env.REACT_APP_API_BASE_URL || 
           process.env.REACT_APP_BACKEND_URL + '/api' ||
           'https://trading-simulator-iw7q.onrender.com/api';
  }
};

const API_BASE_URL = getApiBaseUrl();

console.log('🔧 API Configuration:', {
  baseUrl: API_BASE_URL,
  environment: process.env.NODE_ENV,
  hostname: window.location.hostname,
  isDevelopment: process.env.NODE_ENV === 'development'
});

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  // Add timeout for better error handling
  timeout: 30000
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    if (process.env.REACT_APP_DEBUG === 'true') {
      console.log('🌐 API Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullUrl: `${config.baseURL}${config.url}`
      });
    }
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    if (process.env.REACT_APP_DEBUG === 'true') {
      console.log('✅ API Response:', {
        status: response.status,
        url: response.config.url,
        data: response.data
      });
    }
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', {
      status: error.response?.status,
      url: error.config?.url,
      message: error.message,
      baseURL: error.config?.baseURL
    });
    
    // Provide helpful error messages based on error type
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      console.error('💡 Backend connection failed. Check if backend is running at:', API_BASE_URL);
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
      console.log('🚀 Creating simulation with backend at:', API_BASE_URL);
      console.log('📊 Parameters:', parameters);
      
      const response = await api.post('/simulation', {
        initialPrice: 100,
        duration: 3600,
        volatilityFactor: 1.0,
        scenarioType: 'standard',
        ...parameters
      });
      
      console.log('✅ Simulation created successfully:', response.data);
      return { data: response.data };
    } catch (error: any) {
      console.error('❌ Error creating simulation:', error);
      
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

  // 🆕 NEW: Check if simulation is ready for WebSocket connections
  checkSimulationReady: async (id: string): Promise<ApiResponse<{ready: boolean, status: string, id: string}>> => {
    try {
      console.log(`🔍 Checking simulation readiness for ${id}...`);
      const response = await api.get(`/simulation/${id}/ready`);
      console.log(`✅ Readiness check response:`, response.data);
      return { data: response.data };
    } catch (error: any) {
      console.error(`❌ Error checking simulation readiness for ${id}:`, error);
      
      let errorMessage = 'Failed to check simulation readiness';
      if (error.response?.status === 404) {
        errorMessage = 'Simulation not found or ready endpoint not available';
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

  // 🆕 NEW: Wait for simulation to be ready with timeout
  waitForSimulationReady: async (id: string, maxAttempts: number = 10, delayMs: number = 500): Promise<ApiResponse<{ready: boolean, attempts: number}>> => {
    console.log(`⏳ Waiting for simulation ${id} to be ready (max ${maxAttempts} attempts)...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔍 Readiness check attempt ${attempt}/${maxAttempts} for simulation ${id}`);
      
      try {
        const result = await SimulationApi.checkSimulationReady(id);
        
        if (result.data?.ready) {
          console.log(`✅ Simulation ${id} is ready after ${attempt} attempts!`);
          return { 
            data: { ready: true, attempts: attempt }
          };
        } else {
          console.log(`⏳ Simulation ${id} not ready yet (attempt ${attempt}) - status: ${result.data?.status}`);
        }
        
        if (result.error) {
          console.log(`❌ Error on attempt ${attempt}: ${result.error}`);
          // Continue trying unless it's the last attempt
          if (attempt === maxAttempts) {
            return { 
              data: { ready: false, attempts: attempt },
              error: result.error 
            };
          }
        }
        
      } catch (error: any) {
        console.log(`❌ Exception on attempt ${attempt}:`, error.message);
        // Continue trying unless it's the last attempt
        if (attempt === maxAttempts) {
          return { 
            data: { ready: false, attempts: attempt },
            error: error.message || 'Unknown error'
          };
        }
      }
      
      // Wait before next attempt (except on last attempt)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    console.log(`⏰ Simulation ${id} failed to become ready after ${maxAttempts} attempts`);
    return { 
      data: { ready: false, attempts: maxAttempts },
      error: `Simulation failed to become ready after ${maxAttempts} attempts`
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
      const response = await api.post(`/simulation/${id}/reset`);
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
      const response = await api.post(`/simulation/${id}/speed`, { speed });
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
  }
};

// Enhanced test utilities with backend URL verification
export const SimulationUtils = {
  testBackendConnection: async (): Promise<boolean> => {
    try {
      console.log('🧪 Testing backend connection to:', API_BASE_URL);
      
      const testResponse = await api.get('/test');
      console.log('✅ Backend connection successful:', testResponse.data);
      return true;
      
    } catch (error: any) {
      console.error('❌ Backend connection failed:', error);
      
      if (error.code === 'ECONNREFUSED') {
        console.log('💡 Backend server appears to be down at:', API_BASE_URL);
      } else if (error.response?.status === 404) {
        console.log('💡 Backend running but route not found. Check backend routes.');
      } else if (error.response?.status >= 500) {
        console.log('💡 Backend server error. Check backend logs.');
      }
      
      return false;
    }
  },

  testSimulationSystem: async (): Promise<boolean> => {
    try {
      console.log('🧪 Testing simulation system...');
      
      // First test backend connection
      const backendOk = await SimulationUtils.testBackendConnection();
      if (!backendOk) {
        return false;
      }
      
      // Try creating a simulation
      const simResult = await SimulationApi.createSimulation({
        initialPrice: 100,
        duration: 30,
        volatilityFactor: 1.0
      });
      
      if (simResult.error) {
        console.log('❌ Failed to create simulation:', simResult.error);
        return false;
      }
      
      console.log('✅ Simulation system working! Created:', simResult.data);
      return true;
      
    } catch (error: any) {
      console.error('❌ Simulation system test failed:', error);
      return false;
    }
  },

  // 🆕 NEW: Test the ready endpoint specifically
  testReadyEndpoint: async (simulationId?: string): Promise<boolean> => {
    try {
      // Use provided simulation ID or try to create one
      let testSimId = simulationId;
      
      if (!testSimId) {
        console.log('🧪 Creating test simulation for ready endpoint test...');
        const simResult = await SimulationApi.createSimulation({
          initialPrice: 100,
          duration: 30,
          volatilityFactor: 1.0
        });
        
        if (simResult.error || !simResult.data) {
          console.log('❌ Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('❌ No simulation ID available for ready endpoint test');
        return false;
      }
      
      console.log('🧪 Testing ready endpoint for simulation:', testSimId);
      
      const readyResult = await SimulationApi.checkSimulationReady(testSimId);
      
      if (readyResult.error) {
        console.log('❌ Ready endpoint test failed:', readyResult.error);
        return false;
      }
      
      console.log('✅ Ready endpoint working! Response:', readyResult.data);
      return true;
      
    } catch (error: any) {
      console.error('❌ Ready endpoint test failed:', error);
      return false;
    }
  },

  debugConfiguration: () => {
    console.log('🔍 Frontend Configuration Debug:', {
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
      }
    });
  }
};

// Make debugging functions available in browser console
if (typeof window !== 'undefined') {
  (window as any).testBackend = SimulationUtils.testBackendConnection;
  (window as any).testSimulation = SimulationUtils.testSimulationSystem;
  (window as any).testReadyEndpoint = SimulationUtils.testReadyEndpoint;
  (window as any).debugConfig = SimulationUtils.debugConfiguration;
  (window as any).SimulationApi = SimulationApi;
  
  console.log('🛠️ Debug functions available:');
  console.log('  testBackend() - Test backend connection');
  console.log('  testSimulation() - Test full simulation system');
  console.log('  testReadyEndpoint(simulationId?) - Test ready endpoint');
  console.log('  debugConfig() - Show configuration details');
}

export default {
  TraderApi,
  SimulationApi,
  SimulationUtils
};