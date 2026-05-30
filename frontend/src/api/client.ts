import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

// Cloud deployment: set VITE_API_BASE_URL to your Railway ai-agent URL
// e.g. https://ai-agent-xxx.railway.app
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8005';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8005';

export { API_BASE_URL, WS_URL };

// Service base URLs — use per-service env vars or fall back to Railway/nginx paths
const SERVICE_URLS = {
  marketData: import.meta.env.VITE_MARKET_DATA_URL || import.meta.env.VITE_API_BASE_URL?.replace('ai-agent', 'market-data') || 'http://localhost:8001',
  strategy: import.meta.env.VITE_STRATEGY_URL || import.meta.env.VITE_API_BASE_URL?.replace('ai-agent', 'strategy-engine') || 'http://localhost:8002',
  risk: import.meta.env.VITE_RISK_URL || import.meta.env.VITE_API_BASE_URL?.replace('ai-agent', 'risk-management') || 'http://localhost:8003',
  execution: import.meta.env.VITE_EXECUTION_URL || import.meta.env.VITE_API_BASE_URL?.replace('ai-agent', 'execution-engine') || 'http://localhost:8004',
  agent: import.meta.env.VITE_AGENT_URL || API_BASE_URL,
  monitoring: import.meta.env.VITE_MONITORING_URL || import.meta.env.VITE_API_BASE_URL?.replace('ai-agent', 'monitoring') || 'http://localhost:8006',
};

function createClient(baseURL: string): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor - add auth token if available
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response interceptor - handle errors
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export const marketDataClient = createClient(`${SERVICE_URLS.marketData}/api/v1`);
export const strategyClient = createClient(`${SERVICE_URLS.strategy}/api/v1`);
export const riskClient = createClient(`${SERVICE_URLS.risk}/api/v1`);
export const executionClient = createClient(`${SERVICE_URLS.execution}/api/v1`);
export const agentClient = createClient(`${SERVICE_URLS.agent}/api/v1`);
export const monitoringClient = createClient(`${SERVICE_URLS.monitoring}/api/v1`);
