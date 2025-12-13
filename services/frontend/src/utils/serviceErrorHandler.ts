/**
 * Service Error Handler Utility
 * Detects connection errors and provides helpful messages about which service is down
 */

export interface ServiceErrorInfo {
  serviceName: string;
  servicePort: number;
  servicePath: string;
  startCommand: string;
  description: string;
}

/**
 * Maps API endpoints to service information
 * Port configured in allegro/.env: API_GATEWAY_PORT (default: 3411)
 * Note: In Vite, use import.meta.env for environment variables (must be prefixed with VITE_)
 */
const API_GATEWAY_PORT = parseInt(
  import.meta.env.VITE_API_GATEWAY_PORT || 
  import.meta.env.API_GATEWAY_PORT || 
  '3411', 
  10
);

const SERVICE_MAP: Record<string, ServiceErrorInfo> = {
  '/settings': {
    serviceName: 'API Gateway',
    servicePort: API_GATEWAY_PORT,
    servicePath: 'services/api-gateway',
    startCommand: 'cd services/api-gateway && npm run start:dev',
    description: 'Routes requests to backend services',
  },
  '/allegro': {
    serviceName: 'API Gateway',
    servicePort: API_GATEWAY_PORT,
    servicePath: 'services/api-gateway',
    startCommand: 'cd services/api-gateway && npm run start:dev',
    description: 'Routes requests to backend services',
  },
  '/import': {
    serviceName: 'API Gateway',
    servicePort: API_GATEWAY_PORT,
    servicePath: 'services/api-gateway',
    startCommand: 'cd services/api-gateway && npm run start:dev',
    description: 'Routes requests to backend services',
  },
  '/auth': {
    serviceName: 'API Gateway',
    servicePort: API_GATEWAY_PORT,
    servicePath: 'services/api-gateway',
    startCommand: 'cd services/api-gateway && npm run start:dev',
    description: 'Routes requests to backend services',
  },
};

/**
 * Type guard for error objects with common error properties
 */
interface ErrorLike {
  code?: string;
  message?: string;
  isAxiosError?: boolean;
  response?: unknown;
}

/**
 * Detects if an error is a connection error
 */
export function isConnectionError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as ErrorLike;
    // Check for network errors
    if (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || err.message?.includes('ERR_CONNECTION_REFUSED')) {
      return true;
    }
    // Check for axios network errors
    if (err.isAxiosError && !err.response) {
      return true;
    }
  }
  return false;
}

/**
 * Gets service information based on the API endpoint
 */
export function getServiceInfo(url: string): ServiceErrorInfo | null {
  // Extract the path from the URL
  const path = new URL(url, 'http://localhost').pathname;
  
  // Find matching service
  for (const [endpoint, info] of Object.entries(SERVICE_MAP)) {
    if (path.startsWith(endpoint)) {
      return info;
    }
  }
  
  // Default to API Gateway if no match
  return {
    serviceName: 'API Gateway',
    servicePort: API_GATEWAY_PORT,
    servicePath: 'services/api-gateway',
    startCommand: 'cd services/api-gateway && npm run start:dev',
    description: 'Routes requests to backend services',
  };
}

/**
 * Generates a helpful error message with service information
 */
export function getConnectionErrorMessage(_error: unknown, url: string): string {
  const serviceInfo = getServiceInfo(url);
  
  if (!serviceInfo) {
    return 'Connection error: Unable to reach the service. Please check if the service is running.';
  }
  
  // Determine Docker service name from container name pattern
  const dockerServiceName = serviceInfo.serviceName === 'API Gateway' ? 'api-gateway' : 
    serviceInfo.serviceName.toLowerCase().replace(/\s+/g, '-');
  
  return `❌ ${serviceInfo.serviceName} (port ${serviceInfo.servicePort}) is not accessible.

${serviceInfo.description}

To start the service:

Development (from project root):
  cd ${serviceInfo.servicePath} && npm run start:dev

Docker (from project root directory):
  # Make sure you're in the allegro project directory, not nginx-microservice
  cd ~/allegro  # or your project path
  docker compose up -d ${dockerServiceName}

Check if container is running:
  docker ps | grep ${dockerServiceName}

Check service health:
  curl http://localhost:${serviceInfo.servicePort}/health

If using Docker, check logs:
  docker logs allegro-${dockerServiceName}-blue
  # or
  docker logs allegro-${dockerServiceName}-green

If service is not in docker-compose.yml, check:
  - Are you in the correct project directory?
  - Is the service defined in docker-compose.yml?
  - Try: docker compose ps (to see all running services)`;
}

