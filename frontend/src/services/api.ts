// frontend/src/services/api.ts - Fixed to Match Simplified Backend
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

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
  // FIXED: Use correct endpoint that matches backend
  createSimulation: async (parameters: any = {}): Promise<ApiResponse<any>> => {
    try {
      console.log('🚀 Creating clean simulation with parameters:', parameters);
      
      // FIXED: Use correct endpoint - matches backend '/api/simulation' POST route
      const response = await api.post('/simulation', {
        // Default clean parameters for real-time chart
        initialPrice: 100,
        duration: 3600, // 1 hour
        volatilityFactor: 1.0,
        scenarioType: 'standard',
        // Override with any provided parameters
        ...parameters
      });
      
      console.log('✅ Clean simulation created:', response.data);
      return { data: response.data };
    } catch (error: any) {
      console.error('❌ Error creating simulation:', error);
      
      // Better error handling
      let errorMessage = 'Failed to create simulation';
      if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'No response from server - check if backend is running';
      } else {
        // Something else happened
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
      
      // Better error handling for 404s
      let errorMessage = 'Unknown error';
      if (error.response?.status === 404) {
        errorMessage = 'Simulation not found';
      } else if (error.response) {
        errorMessage = error.response.data?.error || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'No response from server';
      } else {
        errorMessage = error.message;
      }
      
      return { 
        data: null, 
        error: errorMessage
      };
    }
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

// ENHANCED: Better test utilities for debugging
export const SimulationUtils = {
  // Test if basic simulation system is working
  testSimulationSystem: async (): Promise<boolean> => {
    try {
      console.log('🧪 Testing clean simulation system...');
      
      // Test the exact endpoint the frontend uses
      const testResponse = await api.get('/test');
      console.log('🔧 API test endpoint response:', testResponse.data);
      
      // Try creating a basic simulation
      const simResult = await SimulationApi.createSimulation({
        initialPrice: 100,
        duration: 30, // 30 minutes
        volatilityFactor: 1.0
      });
      
      if (simResult.error) {
        console.log('❌ Failed to create simulation:', simResult.error);
        return false;
      }
      
      console.log('✅ Clean simulation system working! Created simulation:', simResult.data);
      return true;
      
    } catch (error: any) {
      console.error('❌ Simulation system test failed:', error);
      
      // Provide helpful debugging info
      if (error.code === 'ECONNREFUSED') {
        console.log('💡 Backend appears to be down. Check if server is running on port 3001');
      } else if (error.response?.status === 404) {
        console.log('💡 Route not found. Check if backend routes are properly configured');
      } else if (error.response?.status === 500) {
        console.log('💡 Server error. Check backend logs for details');
      }
      
      return false;
    }
  },

  // Debug API connectivity
  debugApiConnectivity: async () => {
    console.log('🔍 Debugging API connectivity...');
    console.log('API Base URL:', API_BASE_URL);
    
    try {
      // Test basic connectivity
      const response = await fetch(`${API_BASE_URL}/test`);
      console.log('✅ API reachable, status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📡 API response:', data);
      } else {
        console.log('❌ API returned error status:', response.status);
      }
    } catch (error) {
      console.error('❌ API connection failed:', error);
    }
  },

  // Create simulation with recommended settings for beginners
  createBeginnerSimulation: async (): Promise<ApiResponse<any>> => {
    console.log('🎯 Creating beginner-friendly simulation...');
    return await SimulationApi.createSimulation({
      initialPrice: 100, // Start at $100
      duration: 3600, // 1 hour
      volatilityFactor: 1.0, // Normal volatility
      scenarioType: 'standard'
    });
  },

  // Create high-frequency simulation for testing
  createTestSimulation: async (): Promise<ApiResponse<any>> => {
    console.log('⚡ Creating test simulation...');
    return await SimulationApi.createSimulation({
      initialPrice: 50, // Start at $50
      duration: 1800, // 30 minutes
      volatilityFactor: 1.5, // Higher volatility for testing
      scenarioType: 'volatility_challenge'
    });
  },

  // Test real-time chart generation
  testRealTimeChart: async (): Promise<boolean> => {
    try {
      console.log('📈 Testing real-time chart generation...');
      
      // Create simulation
      const simResult = await SimulationApi.createSimulation({
        initialPrice: 100,
        duration: 60, // 1 hour
        volatilityFactor: 1.0
      });
      
      if (simResult.error) {
        console.log('❌ Failed to create simulation for chart test:', simResult.error);
        return false;
      }
      
      const simId = simResult.data?.simulationId || simResult.data?.data?.id || simResult.data?.id;
      if (!simId) {
        console.log('❌ No simulation ID returned');
        return false;
      }
      
      console.log('✅ Simulation created for chart test:', simId);
      
      // Try to start it
      const startResult = await SimulationApi.startSimulation(simId);
      if (startResult.error) {
        console.log('❌ Failed to start simulation:', startResult.error);
        return false;
      }
      
      console.log('✅ Real-time chart test successful! Simulation started:', simId);
      console.log('📊 Chart should now be building real-time candles');
      
      return true;
      
    } catch (error) {
      console.error('❌ Real-time chart test failed:', error);
      return false;
    }
  }
};

// Enhanced global testing functions for browser console
if (typeof window !== 'undefined') {
  (window as any).testSimulation = SimulationUtils.testSimulationSystem;
  (window as any).debugAPI = SimulationUtils.debugApiConnectivity;
  (window as any).testChart = SimulationUtils.testRealTimeChart;
  (window as any).SimulationUtils = SimulationUtils;
  (window as any).SimulationApi = SimulationApi;
  
  console.log('🛠️ Debug functions available:');
  console.log('  testSimulation() - Test basic simulation creation');
  console.log('  debugAPI() - Test API connectivity');
  console.log('  testChart() - Test real-time chart generation');
}

export default {
  TraderApi,
  SimulationApi,
  SimulationUtils
};