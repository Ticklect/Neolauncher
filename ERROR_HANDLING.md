# Neo Launcher - Error Handling Patterns

## Overview

Neo Launcher implements comprehensive error handling patterns to ensure robust operation across network failures, authentication issues, and backend unavailability. This document outlines the key error handling mechanisms and best practices used throughout the codebase.

## Core Error Handling Components

### 1. Enhanced API Error Handling (`src/main/services/hydra-api.ts`)

#### Custom Error Classes
```typescript
export class NetworkError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class BackendUnavailableError extends Error {
  constructor(message: string = 'Backend service is currently unavailable') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}
```

#### Retry Logic with Exponential Backoff
- **Default retry attempts**: 3
- **Default retry delay**: 1 second with exponential backoff
- **Retryable errors**: Network timeouts, connection refused, 5xx server errors
- **Non-retryable errors**: Authentication errors (401), authorization errors

#### Error Categorization
```typescript
private static isRetryableError(error: any): boolean {
  if (error instanceof AxiosError) {
    // Retry on network errors and 5xx server errors
    return !error.response || (error.response.status >= 500 && error.response.status < 600);
  }
  
  // Retry on generic network errors
  return error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT';
}
```

### 2. Authentication Error Handling

#### Automatic Token Refresh
- **Token expiration detection**: 5-minute buffer before expiration
- **Automatic refresh**: Transparent token renewal
- **Sign-out handling**: Automatic cleanup on authentication failures

#### User Session Management
```typescript
private static readonly handleUnauthorizedError = (err) => {
  if (err instanceof AxiosError && err.response?.status === 401) {
    // Clear user data and trigger sign-out
    this.userAuth = { authToken: "", expirationTimestamp: 0, refreshToken: "", subscription: null };
    this.sendSignOutEvent();
  }
  throw err;
};
```

### 3. Frontend Error Handling (`src/renderer/src/`)

#### Catalogue Page Fallbacks
- **Mock data fallbacks**: When backend is unavailable
- **Graceful degradation**: UI remains functional with placeholder content
- **Error boundaries**: React error boundaries for component-level error handling

#### Search Functionality Resilience
```typescript
const debouncedSearch = useRef(
  debounce(async (filters, pageSize, offset) => {
    try {
      const response = await window.electron.searchGames(filters, pageSize, offset);
      setResults(response.edges);
      setItemsCount(response.count);
    } catch (error) {
      // Use mock data when search fails
      setResults(mockCatalogueData.games);
      setItemsCount(mockCatalogueData.games.length);
    }
    setIsLoading(false);
  }, 500)
).current;
```

### 4. Logging System (`src/main/services/logger.ts`)

#### Multi-Component Logging
- **Network logger**: API request/response logging
- **Python RPC logger**: External service communication
- **Achievements logger**: Game achievement tracking
- **Error-specific log files**: Separate files for different error types

#### Structured Logging
```typescript
logger.error('Backend connection failed:', error.message);
logger.warn(`Request failed (attempt ${attempt + 1}/${retryAttempts + 1}):`, error.message);
```

### 5. WebSocket Error Handling

#### Connection Resilience
- **Automatic reconnection**: Exponential backoff strategy
- **Connection state management**: Track connection status
- **Message queuing**: Buffer messages during disconnection

#### Error Recovery
```typescript
tryReconnect() {
  // Exponential backoff with max retry limit
  const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
  setTimeout(() => this.connect(), delay);
}
```

### 6. Toast Notifications (`src/renderer/src/hooks/use-toast.ts`)

#### User-Facing Error Messages
- **Error categorization**: Different toast types for different errors
- **User-friendly messages**: Clear, actionable error descriptions
- **Non-intrusive design**: Toast notifications don't block UI

## Error Handling Best Practices

### 1. Graceful Degradation
- **Fallback content**: Always provide alternative content when services fail
- **Progressive enhancement**: Core functionality works without optional features
- **User experience**: Maintain UI responsiveness even during errors

### 2. Comprehensive Logging
- **Error context**: Include relevant data for debugging
- **Performance tracking**: Monitor error frequency and impact
- **User feedback**: Log user actions that led to errors

### 3. Retry Strategies
- **Exponential backoff**: Prevent overwhelming failed services
- **Retry limits**: Avoid infinite retry loops
- **Selective retry**: Only retry appropriate error types

### 4. Error Boundaries
- **Component isolation**: Prevent single component errors from crashing the app
- **Recovery mechanisms**: Provide ways to recover from errors
- **User guidance**: Clear instructions for error resolution

## Error Handling Flow

### Network Request Flow
1. **Request initiation** → Validate options and authentication
2. **Request execution** → Execute with retry logic
3. **Error detection** → Categorize error type
4. **Error handling** → Apply appropriate strategy (retry, fallback, user notification)
5. **Logging** → Record error details for debugging
6. **Recovery** → Implement fallback or retry mechanism

### Authentication Flow
1. **Token validation** → Check token expiration
2. **Token refresh** → Attempt automatic refresh
3. **Authentication failure** → Clear user data and sign out
4. **User notification** → Inform user of authentication issues

## Monitoring and Debugging

### Error Tracking
- **Error frequency**: Monitor error rates across different components
- **Error patterns**: Identify common error scenarios
- **Performance impact**: Track error impact on app performance

### Debugging Tools
- **DevTools integration**: Browser DevTools for frontend debugging
- **Network logging**: Detailed API request/response logging
- **Error boundaries**: React DevTools for component error tracking

## Future Enhancements

### Planned Improvements
1. **Error analytics**: Track error patterns and user impact
2. **Automated recovery**: Self-healing mechanisms for common errors
3. **User feedback integration**: Collect user reports for error resolution
4. **Performance monitoring**: Real-time error impact assessment

### Error Prevention
1. **Input validation**: Prevent errors through proper validation
2. **Service health checks**: Proactive monitoring of backend services
3. **Circuit breakers**: Prevent cascade failures in distributed systems

## Conclusion

Neo Launcher's error handling system provides robust operation across various failure scenarios while maintaining excellent user experience. The combination of retry logic, fallback mechanisms, and comprehensive logging ensures the application remains functional and debuggable even when external services are unavailable.

The error handling patterns follow industry best practices and provide a solid foundation for future enhancements and scalability. 