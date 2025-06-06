// frontend/src/services/api.ts - Fixed API endpoints
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
  // Make parameters optional with a default empty object
  createSimulation: async (parameters: any = {}) => {
    try {
      const response = await api.post('/simulation', parameters);
      return { data: response.data };
    } catch (error) {
      console.error('Error creating simulation:', error);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
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
    } catch (error) {
      console.error(`Error fetching simulation ${id}:`, error);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
  
  startSimulation: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/start`);
      return { data: response.data };
    } catch (error) {
      console.error(`Error starting simulation ${id}:`, error);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
  
  pauseSimulation: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/pause`);
      return { data: response.data };
    } catch (error) {
      console.error(`Error pausing simulation ${id}:`, error);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
  
  resetSimulation: async (id: string) => {
    try {
      const response = await api.post(`/simulation/${id}/reset`);
      return { data: response.data };
    } catch (error) {
      console.error(`Error resetting simulation ${id}:`, error);
      return { 
        data: null, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  },
  
  // Add new method for setting simulation speed
  setSimulationSpeed: async (id: string, speed: number) => {
    try {
      const response = await api.post(`/simulation/${id}/speed`, { speed });
      return { 
        data: response.data,
        success: true,
        error: null 
      };
    } catch (error) {
      console.error(`Error setting simulation speed for ${id}:`, error);
      return { 
        data: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
};

export default {
  TraderApi,
  SimulationApi
};