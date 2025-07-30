# SDK Client Foundation & Authentication Bridge

## Overview

This backlog item covers the foundational setup for integrating the Ameide Core SDK into the AI chatbot. It establishes the SDK client initialization, authentication bridge with NextAuth, and basic infrastructure needed for subsequent integration work.

## Objectives

1. Initialize and configure the Ameide SDK client
2. Create an authentication bridge between NextAuth and the SDK
3. Set up environment configuration
4. Implement common query helpers and error handling
5. Establish testing utilities for SDK operations

## Technical Requirements

### 1. SDK Client Factory (`lib/ameide/client.ts`)

Create a factory function that initializes the AmeideClient with proper configuration:

```typescript
import { AmeideClient } from '@ameide/sdk';
import { getServerSession } from 'next-auth';
import { auth } from '@/app/(auth)/auth';
import { NextAuthProvider } from './auth-bridge';

export async function createAmeideClient() {
  const session = await auth();
  
  if (!session) {
    throw new Error('No authenticated session');
  }
  
  return new AmeideClient({
    baseUrl: process.env.AMEIDE_API_URL!,
    auth: new NextAuthProvider(() => auth()),
    timeout: 30000,
    headers: {
      'x-tenant-id': process.env.AMEIDE_TENANT_ID || 'default',
    },
  });
}

// For client-side usage with session
export function createAmeideClientWithSession(session: Session) {
  return new AmeideClient({
    baseUrl: process.env.NEXT_PUBLIC_AMEIDE_API_URL!,
    auth: {
      type: 'bearer',
      token: session.accessToken || '',
    },
    timeout: 30000,
    headers: {
      'x-tenant-id': process.env.NEXT_PUBLIC_AMEIDE_TENANT_ID || 'default',
    },
  });
}
```

### 2. Authentication Bridge (`lib/ameide/auth-bridge.ts`)

Implement an auth provider that bridges NextAuth sessions with the SDK:

```typescript
import type { AuthProvider } from '@ameide/sdk';
import type { Session } from 'next-auth';

export class NextAuthProvider implements AuthProvider {
  constructor(
    private getSession: () => Promise<Session | null>
  ) {}
  
  async getAccessToken(): Promise<string> {
    const session = await this.getSession();
    
    if (!session?.user?.id) {
      throw new Error('No authenticated session');
    }
    
    // Option 1: Use NextAuth session as bearer token
    // For now, we'll use the user ID as a simple token
    // In production, this should be a proper JWT or API key
    return `nextauth:${session.user.id}`;
  }
  
  async refreshToken(): Promise<string> {
    // NextAuth handles refresh automatically
    return this.getAccessToken();
  }
  
  async getUserId(): Promise<string> {
    const session = await this.getSession();
    return session?.user?.id || 'anonymous';
  }
}
```

### 3. Environment Configuration

Update `.env.example` with SDK configuration:

```bash
# Ameide SDK Configuration
AMEIDE_API_URL=http://localhost:8080
NEXT_PUBLIC_AMEIDE_API_URL=http://localhost:8080
AMEIDE_TENANT_ID=default
NEXT_PUBLIC_AMEIDE_TENANT_ID=default

# Feature flags
NEXT_PUBLIC_USE_AMEIDE_SDK=false
```

### 4. Query Helpers (`lib/ameide/queries.ts`)

Create wrapper functions for common SDK operations:

```typescript
import { AmeideClient } from '@ameide/sdk';
import { createAmeideClient } from './client';

export class AmeideSDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AmeideSDKError';
  }
}

// Artifact operations
export async function getArtifact(artifactId: string) {
  try {
    const client = await createAmeideClient();
    return await client.getArtifact(artifactId);
  } catch (error) {
    throw new AmeideSDKError(
      'Failed to fetch artifact',
      'ARTIFACT_FETCH_ERROR',
      error
    );
  }
}

export async function getArtifactSnapshot(
  artifactId: string,
  version?: bigint
) {
  try {
    const client = await createAmeideClient();
    return await client.getArtifactSnapshot(artifactId, version);
  } catch (error) {
    throw new AmeideSDKError(
      'Failed to fetch artifact snapshot',
      'SNAPSHOT_FETCH_ERROR',
      error
    );
  }
}

export async function createArtifact(
  type: string,
  title: string,
  metadata?: Record<string, any>
) {
  try {
    const client = await createAmeideClient();
    const session = await auth();
    
    const command = CommandBuilder.createCommand(
      generateUUID(), // aggregateId
      session?.user?.id || 'anonymous',
      {
        metadata: {
          type,
          title,
          ...metadata,
        },
      }
    );
    
    // Create save command for initial artifact
    const saveCommand = CommandBuilder.createSaveCommand(
      command,
      {
        type: SaveCommand_SaveType.CREATE,
        description: `Create ${type} artifact: ${title}`,
      }
    );
    
    return await client.executeCommand(saveCommand);
  } catch (error) {
    throw new AmeideSDKError(
      'Failed to create artifact',
      'ARTIFACT_CREATE_ERROR',
      error
    );
  }
}

// Retry wrapper for resilience
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}
```

### 5. Feature Flags (`lib/ameide/features.ts`)

Implement feature flags for gradual rollout:

```typescript
export const ameideFeatures = {
  // Global SDK enablement
  useSDK: process.env.NEXT_PUBLIC_USE_AMEIDE_SDK === 'true',
  
  // Per-artifact-type flags
  useSdkForBpmn: process.env.NEXT_PUBLIC_USE_AMEIDE_SDK_BPMN === 'true',
  useSdkForCode: process.env.NEXT_PUBLIC_USE_AMEIDE_SDK_CODE === 'true',
  useSdkForText: process.env.NEXT_PUBLIC_USE_AMEIDE_SDK_TEXT === 'true',
  
  // Feature-specific flags
  enableRealTimeSync: process.env.NEXT_PUBLIC_ENABLE_REALTIME_SYNC === 'true',
  enableCommandHistory: process.env.NEXT_PUBLIC_ENABLE_COMMAND_HISTORY === 'true',
};

export function shouldUseSDK(artifactKind?: string): boolean {
  if (!ameideFeatures.useSDK) return false;
  
  if (artifactKind) {
    switch (artifactKind) {
      case 'bpmn':
        return ameideFeatures.useSdkForBpmn;
      case 'code':
        return ameideFeatures.useSdkForCode;
      case 'text':
        return ameideFeatures.useSdkForText;
      default:
        return false;
    }
  }
  
  return true;
}
```

## Testing Strategy

### 1. Mock SDK Client (`lib/ameide/__tests__/mock-client.ts`)

```typescript
export function createMockAmeideClient() {
  return {
    getArtifact: jest.fn(),
    getArtifactSnapshot: jest.fn(),
    executeCommand: jest.fn(),
    subscribeToAggregate: jest.fn(),
    // ... other methods
  };
}
```

### 2. Integration Tests

- Test authentication bridge with different session states
- Test error handling and retries
- Test feature flag behavior
- Test environment configuration

## Migration Considerations

1. **Backward Compatibility**: All existing functionality must continue to work
2. **Gradual Rollout**: Use feature flags to enable SDK per artifact type
3. **Error Handling**: Graceful fallback to local storage if SDK is unavailable
4. **Performance**: Consider caching strategies for frequently accessed artifacts

## Success Criteria

- [ ] SDK client can be initialized with proper configuration
- [ ] Authentication bridge successfully maps NextAuth sessions
- [ ] Common operations (get, create, update) work via SDK
- [ ] Error handling provides meaningful feedback
- [ ] Feature flags control SDK usage per artifact type
- [ ] All tests pass with mock and real SDK

## Dependencies

- Ameide Core SDK must be installed (`@ameide/sdk`)
- Environment variables must be configured
- NextAuth must be properly set up

## Next Steps

After this foundation is complete:
1. Implement BPMN-specific SDK integration (001-b)
2. Update chat tools to use SDK (001-c)
3. Add real-time synchronization support
4. Implement command history UI