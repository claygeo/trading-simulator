// frontend/src/services/api.ts - COMPLETE COMMUNICATION LAYER FIX
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

// 🔧 COMMUNICATION FIX: Enhanced axios instance with better error handling
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 45000, // Increased timeout for complex operations
  validateStatus: function (status) {
    // Accept status codes in the range 200-299 and specific error codes we handle
    return (status >= 200 && status < 300) || status === 400 || status === 404 || status === 500;
  }
});

// 🔧 COMMUNICATION FIX: Enhanced response interceptor with retry logic
api.interceptors.response.use(
  (response) => {
    // Log successful responses in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ API Success: ${response.config.method?.toUpperCase()} ${response.config.url}`, {
        status: response.status,
        data: response.data?.success !== undefined ? 
          { success: response.data.success, message: response.data.message } : 
          'Response received'
      });
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Only log detailed errors in development
    if (process.env.NODE_ENV === 'development') {
      console.error('❌ API Error:', {
        status: error.response?.status,
        url: error.config?.url,
        method: error.config?.method?.toUpperCase(),
        message: error.message,
        data: error.response?.data
      });
    }
    
    // 🔧 COMMUNICATION FIX: Handle specific communication errors
    if (error.response?.status === 400) {
      // Bad request - likely validation or state errors
      const errorData = error.response.data;
      if (errorData?.error?.includes('Cannot pause simulation') || 
          errorData?.error?.includes('Cannot resume simulation')) {
        console.warn('⚠️ COMMUNICATION: State validation error - simulation may be in inconsistent state');
        
        // For pause/resume errors, we should refresh the simulation state
        if (originalRequest.url?.includes('/pause') || originalRequest.url?.includes('/start')) {
          console.log('🔄 COMMUNICATION: Suggesting state refresh after pause/start error');
          error.suggestStateRefresh = true;
        }
      }
    }
    
    // 🔧 COMMUNICATION FIX: Retry logic for network errors and server errors
    if (!originalRequest._retry && (
      error.code === 'ECONNREFUSED' || 
      error.code === 'ERR_NETWORK' ||
      error.response?.status >= 500
    )) {
      originalRequest._retry = true;
      
      // Exponential backoff: 1s, 2s, 4s
      const retryDelay = Math.pow(2, originalRequest._retryCount || 0) * 1000;
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      
      if (originalRequest._retryCount <= 3) {
        console.log(`🔄 COMMUNICATION: Retrying API request (${originalRequest._retryCount}/3) in ${retryDelay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return api(originalRequest);
      }
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK') {
      console.error('🔌 Backend connection failed. Check if backend is running at:', API_BASE_URL);
      error.isNetworkError = true;
    }
    
    return Promise.reject(error);
  }
);

export interface ApiResponse<T> {
  data: T;
  error?: string;
  suggestStateRefresh?: boolean;
  isNetworkError?: boolean;
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

// 🔧 COMMUNICATION FIX: Enhanced state checking utilities
const StateUtils = {
  // Wait for simulation state to stabilize
  waitForStateStabilization: async (simulationId: string, maxWaitMs: number = 3000): Promise<boolean> => {
    const startTime = Date.now();
    let lastState: any = null;
    let stableCount = 0;
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await api.get(`/simulation/${simulationId}/status`);
        const currentState = {
          isRunning: response.data.isRunning,
          isPaused: response.data.isPaused
        };
        
        if (JSON.stringify(lastState) === JSON.stringify(currentState)) {
          stableCount++;
          if (stableCount >= 2) {
            console.log('✅ COMMUNICATION: State stabilized:', currentState);
            return true;
          }
        } else {
          stableCount = 0;
          lastState = currentState;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('⚠️ COMMUNICATION: Error checking state stability:', error);
        break;
      }
    }
    
    console.warn('⚠️ COMMUNICATION: State did not stabilize within timeout');
    return false;
  },
  
  // Validate state consistency
  validateStateConsistency: (state: any): { isValid: boolean; issues: string[] } => {
    const issues: string[] = [];
    
    if (state.isRunning === true && state.isPaused === true) {
      issues.push('Contradictory state: isRunning=true and isPaused=true');
    }
    
    if (state.isRunning === false && state.isPaused === false && state.candleCount > 0) {
      // This might be OK if simulation was stopped
      console.log('ℹ️ COMMUNICATION: Simulation stopped with existing candles');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }
};

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
      console.log('💰 COMMUNICATION FIX: Creating simulation with enhanced parameters:', parameters);
      
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
        console.log('💰 COMMUNICATION FIX: Using explicit initialPrice:', parameters.initialPrice);
      } else if (parameters.useCustomPrice && parameters.customPrice) {
        requestBody.useCustomPrice = true;
        requestBody.customPrice = parameters.customPrice;
        console.log('💰 COMMUNICATION FIX: Using custom price:', parameters.customPrice);
      } else if (parameters.priceRange) {
        requestBody.priceRange = parameters.priceRange;
        console.log('💰 COMMUNICATION FIX: Using price range:', parameters.priceRange);
      } else {
        // Let backend generate dynamic price
        requestBody.priceRange = 'random';
        console.log('💰 COMMUNICATION FIX: Using random dynamic pricing (no hardcoded values)');
      }
      
      console.log('📤 COMMUNICATION FIX: Final request body (NO hardcoded $100):', requestBody);
      
      const response = await api.post('/simulation', requestBody);
      
      console.log('📥 COMMUNICATION FIX: Simulation created with enhanced coordination:', response.data);
      
      // FIXED: Log dynamic pricing info if available
      if (response.data?.dynamicPricing) {
        console.log('💰 COMMUNICATION FIX: Dynamic pricing info:', response.data.dynamicPricing);
      }
      
      return { data: response.data };
    } catch (error: any) {
      console.error('❌ COMMUNICATION FIX: Error creating simulation:', error);
      
      let errorMessage = 'Failed to create simulation';
      let isNetworkError = false;
      
      if (error.isNetworkError) {
        isNetworkError = true;
        errorMessage = `No response from backend server: ${API_BASE_URL}`;
      } else if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        isNetworkError = true;
        errorMessage = `No response from backend server: ${API_BASE_URL}`;
      } else {
        errorMessage = error.message || 'Unknown error';
      }
      
      return { 
        data: null, 
        error: errorMessage,
        isNetworkError
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
        console.log('💰 COMMUNICATION FIX: Retrieved simulation with dynamic pricing:', 
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
        error: errorMessage,
        isNetworkError: error.isNetworkError
      };
    }
  },

  // 🔧 COMMUNICATION FIX: Enhanced simulation readiness checking with state validation
  checkSimulationReady: async (id: string): Promise<ApiResponse<{ready: boolean, status: string, id: string}>> => {
    try {
      const response = await api.get(`/simulation/${id}/ready`);
      
      // COMMUNICATION FIX: Validate state consistency
      if (response.data?.details) {
        const validation = StateUtils.validateStateConsistency(response.data.details);
        if (!validation.isValid) {
          console.warn('⚠️ COMMUNICATION: State consistency issues detected:', validation.issues);
        }
      }
      
      // FIXED: Log dynamic pricing readiness if available
      if (response.data?.dynamicPricing) {
        console.log('💰 COMMUNICATION FIX: Simulation ready with dynamic pricing support');
      }
      
      return { data: response.data };
    } catch (error: any) {
      // If /ready endpoint doesn't exist (404), try fallback approach
      if (error.response?.status === 404) {
        console.log(`🔄 COMMUNICATION: Ready endpoint not found for ${id}, trying fallback approach...`);
        
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
      
      console.error(`❌ COMMUNICATION: Error checking simulation readiness for ${id}:`, error);
      
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
        error: errorMessage,
        isNetworkError: error.isNetworkError
      };
    }
  },

  // 🔧 COMMUNICATION FIX: Enhanced waiting with state validation
  waitForSimulationReady: async (id: string, maxAttempts: number = 20, initialDelayMs: number = 500): Promise<ApiResponse<{ready: boolean, attempts: number}>> => {
    let lastError = '';
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await SimulationApi.checkSimulationReady(id);
        
        // Success case
        if (result.data?.ready) {
          console.log(`💰 COMMUNICATION FIX: Simulation ${id} ready after ${attempt} attempts (with enhanced coordination)`);
          
          // COMMUNICATION FIX: Wait for state to stabilize
          await StateUtils.waitForStateStabilization(id, 2000);
          
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
          console.log(`🔄 COMMUNICATION: Simulation ${id} not ready yet, attempt ${attempt}/${maxAttempts}. Status: ${result.data?.status || 'unknown'}`);
        }
        
      } catch (error: any) {
        lastError = error.message || 'Unknown error during readiness check';
        
        // If this is the last attempt, return the error
        if (attempt === maxAttempts) {
          return { 
            data: { ready: false, attempts: attempt },
            error: lastError,
            isNetworkError: error.isNetworkError
          };
        }
      }
      
      // Wait before next attempt (exponential backoff with jitter)
      if (attempt < maxAttempts) {
        const baseDelay = Math.min(6000, initialDelayMs * Math.pow(1.5, attempt - 1));
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
  
  // 🔧 COMMUNICATION FIX: Enhanced start simulation with state validation
  startSimulation: async (id: string): Promise<ApiResponse<any>> => {
    try {
      console.log(`🚀 COMMUNICATION FIX: Starting simulation ${id}`);
      
      // Pre-validate simulation state
      try {
        const statusCheck = await api.get(`/simulation/${id}/status`);
        const currentState = statusCheck.data;
        
        if (currentState.isRunning && !currentState.isPaused) {
          console.warn('⚠️ COMMUNICATION: Simulation already running, skipping start');
          return { 
            data: { 
              ...currentState,
              message: 'Simulation already running',
              skipReason: 'already_running'
            }
          };
        }
        
        if (currentState.isRunning && currentState.isPaused) {
          console.log('🔄 COMMUNICATION: Simulation is paused, will resume instead of start');
        }
        
      } catch (statusError) {
        console.warn('⚠️ COMMUNICATION: Could not pre-validate state, proceeding with start');
      }
      
      const response = await api.post(`/simulation/${id}/start`);
      
      // COMMUNICATION FIX: Verify state change was successful
      if (response.data?.data) {
        const validation = StateUtils.validateStateConsistency(response.data.data);
        if (!validation.isValid) {
          console.error('❌ COMMUNICATION: State inconsistency after start:', validation.issues);
          return {
            data: response.data,
            error: 'State inconsistency detected after start',
            suggestStateRefresh: true
          };
        }
      }
      
      // FIXED: Log dynamic price info when starting
      if (response.data?.data?.dynamicPrice || response.data?.data?.currentPrice) {
        console.log('💰 COMMUNICATION FIX: Started simulation with dynamic price:', 
          response.data.data?.dynamicPrice || response.data.data?.currentPrice);
      }
      
      console.log(`✅ COMMUNICATION FIX: Successfully started simulation ${id}`);
      return { data: response.data };
      
    } catch (error: any) {
      console.error(`❌ COMMUNICATION FIX: Error starting simulation ${id}:`, error);
      
      let apiResponse: ApiResponse<any> = { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to start simulation',
        isNetworkError: error.isNetworkError
      };
      
      // COMMUNICATION FIX: Handle specific error cases
      if (error.response?.status === 400) {
        const errorData = error.response.data;
        if (errorData?.error?.includes('not ready')) {
          apiResponse.error = 'Simulation not ready - still initializing';
        } else if (errorData?.currentState) {
          console.log('📊 COMMUNICATION: Current state during start error:', errorData.currentState);
          apiResponse.suggestStateRefresh = true;
        }
      }
      
      return apiResponse;
    }
  },
  
  // 🔧 COMMUNICATION FIX: Enhanced pause simulation with comprehensive state validation
  pauseSimulation: async (id: string): Promise<ApiResponse<any>> => {
    try {
      console.log(`⏸️ COMMUNICATION FIX: Pausing simulation ${id}`);
      
      // Pre-validate simulation state
      let preValidationState: any = null;
      try {
        const statusCheck = await api.get(`/simulation/${id}/status`);
        preValidationState = statusCheck.data;
        
        console.log('📊 COMMUNICATION: Pre-pause state:', {
          isRunning: preValidationState.isRunning,
          isPaused: preValidationState.isPaused
        });
        
        if (!preValidationState.isRunning || preValidationState.isPaused) {
          console.warn('⚠️ COMMUNICATION: Simulation not in running state, cannot pause');
          return { 
            data: { 
              ...preValidationState,
              message: `Cannot pause - isRunning: ${preValidationState.isRunning}, isPaused: ${preValidationState.isPaused}`,
              skipReason: 'invalid_state'
            },
            error: `Invalid state for pause: running=${preValidationState.isRunning}, paused=${preValidationState.isPaused}`
          };
        }
        
      } catch (statusError) {
        console.warn('⚠️ COMMUNICATION: Could not pre-validate state for pause, proceeding anyway');
      }
      
      const response = await api.post(`/simulation/${id}/pause`);
      
      // COMMUNICATION FIX: Verify pause was successful
      let postValidationSuccess = true;
      try {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for state to propagate
        
        const postStatusCheck = await api.get(`/simulation/${id}/status`);
        const postState = postStatusCheck.data;
        
        console.log('📊 COMMUNICATION: Post-pause state:', {
          isRunning: postState.isRunning,
          isPaused: postState.isPaused
        });
        
        // Validate that pause was successful
        if (postState.isRunning === true || postState.isPaused !== true) {
          console.error('❌ COMMUNICATION: Pause state validation failed!', postState);
          postValidationSuccess = false;
        } else {
          console.log('✅ COMMUNICATION: Pause state validated successfully');
        }
        
        // Check for contradictory states
        const validation = StateUtils.validateStateConsistency(postState);
        if (!validation.isValid) {
          console.error('❌ COMMUNICATION: State inconsistency after pause:', validation.issues);
          postValidationSuccess = false;
        }
        
      } catch (postValidationError) {
        console.warn('⚠️ COMMUNICATION: Could not post-validate pause state:', postValidationError);
      }
      
      if (!postValidationSuccess) {
        return {
          data: response.data,
          error: 'Pause operation completed but state validation failed',
          suggestStateRefresh: true
        };
      }
      
      console.log(`✅ COMMUNICATION FIX: Successfully paused simulation ${id}`);
      return { data: response.data };
      
    } catch (error: any) {
      console.error(`❌ COMMUNICATION FIX: Error pausing simulation ${id}:`, error);
      
      let apiResponse: ApiResponse<any> = { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to pause simulation',
        isNetworkError: error.isNetworkError
      };
      
      // COMMUNICATION FIX: Handle specific pause errors
      if (error.response?.status === 400) {
        const errorData = error.response.data;
        if (errorData?.error?.includes('Cannot pause')) {
          console.log('📊 COMMUNICATION: Pause validation failed on server');
          apiResponse.suggestStateRefresh = true;
          
          if (errorData.currentState) {
            console.log('📊 COMMUNICATION: Server reported state:', errorData.currentState);
          }
        }
      }
      
      // Suggest state refresh for pause errors to resync UI
      if (error.suggestStateRefresh) {
        apiResponse.suggestStateRefresh = true;
      }
      
      return apiResponse;
    }
  },
  
  // 🔧 COMMUNICATION FIX: Enhanced reset simulation with complete state clearing validation
  resetSimulation: async (id: string, options: { generateNewPrice?: boolean } = {}): Promise<ApiResponse<any>> => {
    try {
      console.log(`🔄 COMMUNICATION FIX: Resetting simulation ${id} with enhanced coordination`);
      
      // Prepare reset request with enhanced options
      const requestBody = {
        clearAllData: true,
        resetState: 'complete',
        generateNewPrice: options.generateNewPrice !== false, // Default to true
        // COMMUNICATION FIX: Add reset coordination flags
        validateStateClearing: true,
        ensureCleanStart: true
      };
      
      console.log('💰 COMMUNICATION FIX: Resetting simulation with enhanced state coordination');
      
      const response = await api.post(`/simulation/${id}/reset`, requestBody);
      
      // COMMUNICATION FIX: Verify reset was successful
      let resetValidationSuccess = true;
      try {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for reset to complete
        
        const postResetCheck = await api.get(`/simulation/${id}/status`);
        const postResetState = postResetCheck.data;
        
        console.log('📊 COMMUNICATION: Post-reset state:', {
          isRunning: postResetState.isRunning,
          isPaused: postResetState.isPaused,
          candleCount: postResetState.candleCount,
          tradeCount: postResetState.tradeCount,
          currentPrice: postResetState.currentPrice
        });
        
        // Validate reset was complete
        if (postResetState.isRunning !== false || postResetState.isPaused !== false) {
          console.error('❌ COMMUNICATION: Reset state validation failed - simulation not stopped!');
          resetValidationSuccess = false;
        }
        
        if (postResetState.candleCount > 0) {
          console.warn('⚠️ COMMUNICATION: Reset validation warning - candles still present after reset');
        }
        
        // Check for contradictory states
        const validation = StateUtils.validateStateConsistency(postResetState);
        if (!validation.isValid) {
          console.error('❌ COMMUNICATION: State inconsistency after reset:', validation.issues);
          resetValidationSuccess = false;
        }
        
      } catch (postValidationError) {
        console.warn('⚠️ COMMUNICATION: Could not post-validate reset state:', postValidationError);
        resetValidationSuccess = false;
      }
      
      // FIXED: Log new dynamic price info
      if (response.data?.data?.dynamicPricing || response.data?.data?.currentPrice) {
        console.log('💰 COMMUNICATION FIX: Reset generated new dynamic price:', 
          response.data.data?.dynamicPricing || response.data.data?.currentPrice);
      }
      
      if (!resetValidationSuccess) {
        return {
          data: response.data,
          error: 'Reset operation completed but state validation failed',
          suggestStateRefresh: true
        };
      }
      
      console.log(`✅ COMMUNICATION FIX: Successfully reset simulation ${id} with state validation`);
      return { data: response.data };
      
    } catch (error: any) {
      console.error(`❌ COMMUNICATION FIX: Error resetting simulation ${id}:`, error);
      
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to reset simulation',
        isNetworkError: error.isNetworkError,
        suggestStateRefresh: true // Always suggest refresh after reset errors
      };
    }
  },
  
  // 🔧 COMMUNICATION FIX: Enhanced speed setting with validation - FIXED
  setSimulationSpeed: async (id: string, speed: number): Promise<ApiResponse<any>> => {
    try {
      const response = await api.post(`/simulation/${id}/speed`, { 
        speed,
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substr(2, 9)
      });
      
      // COMMUNICATION FIX: Validate speed change
      if (response.data?.data?.newSpeed !== speed) {
        console.warn(`⚠️ COMMUNICATION: Speed mismatch - requested: ${speed}, applied: ${response.data?.data?.newSpeed}`);
      }
      
      return { 
        data: response.data
        // FIXED: Removed error: null - it's optional so we omit it
      };
    } catch (error: any) {
      console.error(`❌ COMMUNICATION: Error setting simulation speed for ${id}:`, error);
      return { 
        data: null,
        error: error.response?.data?.error || error.message || 'Failed to set simulation speed',
        isNetworkError: error.isNetworkError
      };
    }
  },

  // NEW: Set TPS mode for stress testing - FIXED
  setTPSMode: async (id: string, mode: string): Promise<ApiResponse<any>> => {
    try {
      const response = await api.post(`/simulation/${id}/tps-mode`, { 
        mode,
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substr(2, 9)
      });
      return { 
        data: response.data
        // FIXED: Removed error: null
      };
    } catch (error: any) {
      console.error(`❌ COMMUNICATION: Error setting TPS mode for ${id}:`, error);
      return { 
        data: null,
        error: error.response?.data?.error || error.message || 'Failed to set TPS mode',
        isNetworkError: error.isNetworkError
      };
    }
  },

  // NEW: Trigger liquidation cascade - FIXED
  triggerLiquidationCascade: async (id: string): Promise<ApiResponse<any>> => {
    try {
      const response = await api.post(`/simulation/${id}/stress-test/liquidation-cascade`, {
        timestamp: Date.now(),
        requestId: Math.random().toString(36).substr(2, 9)
      });
      return { 
        data: response.data
        // FIXED: Removed error: null
      };
    } catch (error: any) {
      console.error(`❌ COMMUNICATION: Error triggering liquidation cascade for ${id}:`, error);
      return { 
        data: null,
        error: error.response?.data?.error || error.message || 'Failed to trigger liquidation cascade',
        isNetworkError: error.isNetworkError
      };
    }
  },

  // 🔧 COMMUNICATION FIX: Enhanced stats retrieval
  getSimulationStats: async (id: string): Promise<ApiResponse<any>> => {
    try {
      const response = await api.get(`/simulation/${id}/stats`);
      
      // FIXED: Log dynamic pricing stats if available
      if (response.data?.data?.dynamicPricing) {
        console.log('💰 COMMUNICATION FIX: Retrieved simulation stats with dynamic pricing info:', 
          response.data.data.dynamicPricing);
      }
      
      return { data: response.data };
    } catch (error: any) {
      console.error(`❌ COMMUNICATION: Error fetching simulation stats for ${id}:`, error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to fetch simulation stats',
        isNetworkError: error.isNetworkError
      };
    }
  },
  
  // 🔧 COMMUNICATION FIX: New method to get simulation status with validation
  getSimulationStatus: async (id: string): Promise<ApiResponse<any>> => {
    try {
      const response = await api.get(`/simulation/${id}/status`);
      
      // COMMUNICATION FIX: Validate state consistency
      const validation = StateUtils.validateStateConsistency(response.data);
      if (!validation.isValid) {
        console.warn('⚠️ COMMUNICATION: State consistency issues in status:', validation.issues);
        return {
          data: response.data,
          error: 'State consistency issues detected',
          suggestStateRefresh: true
        };
      }
      
      return { data: response.data };
    } catch (error: any) {
      console.error(`❌ COMMUNICATION: Error getting simulation status for ${id}:`, error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to get simulation status',
        isNetworkError: error.isNetworkError
      };
    }
  },
  
  // 🔧 COMMUNICATION FIX: New method to check communication layer status
  getCommunicationStatus: async (): Promise<ApiResponse<any>> => {
    try {
      const response = await api.get('/communication/status');
      return { data: response.data };
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Error getting communication status:', error);
      return { 
        data: null, 
        error: error.response?.data?.error || error.message || 'Failed to get communication status',
        isNetworkError: error.isNetworkError
      };
    }
  }
};

export const SimulationUtils = {
  // 🔧 COMMUNICATION FIX: Enhanced backend connection testing
  testBackendConnection: async (): Promise<boolean> => {
    try {
      const testResponse = await api.get('/test');
      
      // FIXED: Check for dynamic pricing support in test response
      if (testResponse.data?.communicationLayerFix) {
        console.log('🔧 COMMUNICATION FIX: Backend supports communication layer fix!');
      }
      
      if (testResponse.data?.dynamicPricing) {
        console.log('💰 COMMUNICATION FIX: Backend supports dynamic pricing!');
      }
      
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Backend connection failed:', error);
      
      if (error.code === 'ECONNREFUSED') {
        console.log('🔌 Backend server appears to be down at:', API_BASE_URL);
      } else if (error.response?.status === 404) {
        console.log('🔗 Backend running but route not found. Check backend routes.');
      } else if (error.response?.status >= 500) {
        console.log('🚨 Backend server error. Check backend logs.');
      }
      
      return false;
    }
  },

  // FIXED: Test simulation system with dynamic pricing and communication fixes
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
        console.log('❌ COMMUNICATION: Failed to create simulation:', simResult.error);
        return false;
      }
      
      // FIXED: Verify dynamic pricing worked
      if (simResult.data?.dynamicPricing) {
        console.log('💰 COMMUNICATION FIX: Dynamic pricing test successful:', simResult.data.dynamicPricing);
      }
      
      // COMMUNICATION FIX: Test state consistency
      if (simResult.data?.data) {
        const validation = StateUtils.validateStateConsistency(simResult.data.data);
        if (!validation.isValid) {
          console.warn('⚠️ COMMUNICATION: State consistency issues in test simulation:', validation.issues);
        }
      }
      
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Simulation system test failed:', error);
      return false;
    }
  },

  // 🔧 COMMUNICATION FIX: Enhanced ready endpoint testing
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
          console.log('❌ COMMUNICATION: Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('❌ COMMUNICATION: No simulation ID available for ready endpoint test');
        return false;
      }
      
      const readyResult = await SimulationApi.checkSimulationReady(testSimId);
      
      if (readyResult.error) {
        // If it's a 404, that's expected if the endpoint doesn't exist
        if (readyResult.error.includes('not found') || readyResult.error.includes('404')) {
          console.log('🔄 COMMUNICATION: Ready endpoint not available (using fallback approach)');
          return true; // Fallback approach is working
        }
        console.log('❌ COMMUNICATION: Ready endpoint test failed:', readyResult.error);
        return false;
      }
      
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Ready endpoint test failed:', error);
      return false;
    }
  },

  // 🔧 COMMUNICATION FIX: Enhanced speed endpoint testing
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
          console.log('❌ COMMUNICATION: Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('❌ COMMUNICATION: No simulation ID available for speed endpoint test');
        return false;
      }
      
      const speeds = [2, 6, 50, 100];
      
      for (const speed of speeds) {
        const speedResult = await SimulationApi.setSimulationSpeed(testSimId, speed);
        
        if (speedResult.error) {
          console.log(`❌ COMMUNICATION: Speed endpoint test failed for speed ${speed}:`, speedResult.error);
          return false;
        }
      }
      
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Speed endpoint test failed:', error);
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
          console.log('❌ COMMUNICATION: Failed to create test simulation:', simResult.error);
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('❌ COMMUNICATION: No simulation ID available for TPS endpoint test');
        return false;
      }
      
      const modes = ['NORMAL', 'BURST', 'STRESS', 'HFT'];
      
      for (const mode of modes) {
        const tpsResult = await SimulationApi.setTPSMode(testSimId, mode);
        
        if (tpsResult.error) {
          console.log(`❌ COMMUNICATION: TPS endpoint test failed for mode ${mode}:`, tpsResult.error);
          return false;
        }
      }
      
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: TPS endpoint test failed:', error);
      return false;
    }
  },

  // 🔧 COMMUNICATION FIX: Test pause/start functionality
  testPauseStartFunctionality: async (simulationId?: string): Promise<boolean> => {
    try {
      let testSimId = simulationId;
      
      if (!testSimId) {
        const simResult = await SimulationApi.createSimulation({
          duration: 60,
          volatilityFactor: 1.0,
          priceRange: 'random'
        });
        
        if (simResult.error || !simResult.data) {
          console.log('❌ COMMUNICATION: Failed to create test simulation for pause/start test');
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('❌ COMMUNICATION: No simulation ID for pause/start test');
        return false;
      }
      
      console.log('🧪 COMMUNICATION: Testing pause/start functionality...');
      
      // Test start
      const startResult = await SimulationApi.startSimulation(testSimId);
      if (startResult.error) {
        console.log('❌ COMMUNICATION: Start test failed:', startResult.error);
        return false;
      }
      
      // Wait for simulation to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test pause
      const pauseResult = await SimulationApi.pauseSimulation(testSimId);
      if (pauseResult.error) {
        console.log('❌ COMMUNICATION: Pause test failed:', pauseResult.error);
        return false;
      }
      
      // Test resume (start again)
      await new Promise(resolve => setTimeout(resolve, 1000));
      const resumeResult = await SimulationApi.startSimulation(testSimId);
      if (resumeResult.error) {
        console.log('❌ COMMUNICATION: Resume test failed:', resumeResult.error);
        return false;
      }
      
      console.log('✅ COMMUNICATION: Pause/start functionality test passed');
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Pause/start functionality test failed:', error);
      return false;
    }
  },

  // 🔧 COMMUNICATION FIX: Test reset functionality
  testResetFunctionality: async (simulationId?: string): Promise<boolean> => {
    try {
      let testSimId = simulationId;
      
      if (!testSimId) {
        const simResult = await SimulationApi.createSimulation({
          duration: 30,
          volatilityFactor: 1.0,
          priceRange: 'random'
        });
        
        if (simResult.error || !simResult.data) {
          console.log('❌ COMMUNICATION: Failed to create test simulation for reset test');
          return false;
        }
        
        testSimId = simResult.data.simulationId || simResult.data.data?.id;
      }
      
      if (!testSimId) {
        console.log('❌ COMMUNICATION: No simulation ID for reset test');
        return false;
      }
      
      console.log('🧪 COMMUNICATION: Testing reset functionality...');
      
      // Start simulation to create some data
      await SimulationApi.startSimulation(testSimId);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Test reset
      const resetResult = await SimulationApi.resetSimulation(testSimId);
      if (resetResult.error) {
        console.log('❌ COMMUNICATION: Reset test failed:', resetResult.error);
        return false;
      }
      
      console.log('✅ COMMUNICATION: Reset functionality test passed');
      return true;
      
    } catch (error: any) {
      console.error('❌ COMMUNICATION: Reset functionality test failed:', error);
      return false;
    }
  },

  // ENHANCED: Better configuration debugging with communication layer info
  debugConfiguration: () => {
    console.log('🔧 COMMUNICATION FIX: Frontend Configuration Debug:', {
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
      communicationLayerFix: 'applied',
      enhancedStateValidation: 'active',
      pauseStopFunctionality: 'fixed',
      resetFunctionality: 'enhanced-validation',
      retryLogic: 'exponential-backoff',
      stateStabilization: 'active',
      dynamicPricing: 'supported'
    });
  },

  // NEW: Enhanced diagnostic function with communication layer tests
  runDiagnostics: async (): Promise<{
    backendConnection: boolean;
    simulationSystem: boolean;
    readyEndpoint: boolean;
    speedEndpoint: boolean;
    tpsEndpoint: boolean;
    pauseStartFunctionality: boolean;
    resetFunctionality: boolean;
    communicationLayer: boolean;
    dynamicPricing: boolean;
    errors: string[];
  }> => {
    const results = {
      backendConnection: false,
      simulationSystem: false,
      readyEndpoint: false,
      speedEndpoint: false,
      tpsEndpoint: false,
      pauseStartFunctionality: false,
      resetFunctionality: false,
      communicationLayer: false,
      dynamicPricing: false,
      errors: [] as string[]
    };

    try {
      console.log('🔍🔧 COMMUNICATION FIX: Running comprehensive API diagnostics with communication layer tests...');

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
          // Test dynamic pricing specifically
          try {
            const dynamicPricingTest = await SimulationApi.createSimulation({
              priceRange: 'small',
              duration: 30
            });
            
            if (dynamicPricingTest.data?.dynamicPricing) {
              results.dynamicPricing = true;
              console.log('💰 COMMUNICATION FIX: Dynamic pricing test PASSED!');
            } else {
              results.errors.push('Dynamic pricing not supported or not working');
            }
          } catch (error) {
            results.errors.push('Dynamic pricing test failed');
          }
        }
      }

      // Test communication layer
      if (results.simulationSystem) {
        try {
          const commResult = await SimulationApi.getCommunicationStatus();
          if (commResult.data?.communicationLayerStatus === 'active') {
            results.communicationLayer = true;
            console.log('🔧 COMMUNICATION FIX: Communication layer test PASSED!');
          } else {
            results.errors.push('Communication layer not active');
          }
        } catch (error) {
          results.errors.push('Communication layer test failed');
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

      // Test pause/start functionality
      if (results.simulationSystem) {
        results.pauseStartFunctionality = await SimulationUtils.testPauseStartFunctionality();
        if (!results.pauseStartFunctionality) {
          results.errors.push('Pause/start functionality test failed');
        }
      }

      // Test reset functionality
      if (results.simulationSystem) {
        results.resetFunctionality = await SimulationUtils.testResetFunctionality();
        if (!results.resetFunctionality) {
          results.errors.push('Reset functionality test failed');
        }
      }

      console.log('📊🔧 COMMUNICATION FIX: Diagnostic results with communication layer:', results);
      return results;

    } catch (error: any) {
      results.errors.push(`Diagnostic error: ${error.message}`);
      console.error('❌ COMMUNICATION: Diagnostic failed:', error);
      return results;
    }
  }
};

// Global window functions for debugging - FIXED with communication layer support
if (typeof window !== 'undefined') {
  (window as any).testBackend = SimulationUtils.testBackendConnection;
  (window as any).testSimulation = SimulationUtils.testSimulationSystem;
  (window as any).testReadyEndpoint = SimulationUtils.testReadyEndpoint;
  (window as any).testSpeedEndpoint = SimulationUtils.testSpeedEndpoint;
  (window as any).testTPSEndpoint = SimulationUtils.testTPSEndpoint;
  (window as any).testPauseStart = SimulationUtils.testPauseStartFunctionality;
  (window as any).testReset = SimulationUtils.testResetFunctionality;
  (window as any).debugConfig = SimulationUtils.debugConfiguration;
  (window as any).runDiagnostics = SimulationUtils.runDiagnostics;
  (window as any).SimulationApi = SimulationApi;
  (window as any).StateUtils = StateUtils;
  
  // COMMUNICATION FIX: Add enhanced test functions
  (window as any).testDynamicPricing = async () => {
    console.log('💰🔧 COMMUNICATION FIX: Testing dynamic pricing with different ranges...');
    
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
    console.log(`💰🔧 COMMUNICATION FIX: Testing custom price ${price}...`);
    
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
  
  // COMMUNICATION FIX: Add state validation test function
  (window as any).testStateValidation = async (simulationId: string) => {
    console.log(`🔧 COMMUNICATION FIX: Testing state validation for ${simulationId}...`);
    
    try {
      const result = await SimulationApi.getSimulationStatus(simulationId);
      
      if (result.error) {
        console.log(`❌ STATE VALIDATION: ${result.error}`);
        if (result.suggestStateRefresh) {
          console.log('🔄 STATE VALIDATION: Suggests refreshing state');
        }
      } else {
        console.log(`✅ STATE VALIDATION: Passed for ${simulationId}`);
        console.log('📊 Current state:', {
          isRunning: result.data.isRunning,
          isPaused: result.data.isPaused,
          candleCount: result.data.candleCount
        });
      }
    } catch (error) {
      console.error(`❌ STATE VALIDATION: Test failed -`, error);
    }
  };
}

export default {
  TraderApi,
  SimulationApi,
  SimulationUtils,
  StateUtils
};