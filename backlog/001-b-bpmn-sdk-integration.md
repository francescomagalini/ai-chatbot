# BPMN Artifact SDK Integration

## Overview

This backlog item focuses on integrating the Ameide Core SDK specifically for BPMN artifacts. It covers loading BPMN diagrams from the SDK, capturing diagram edits as commands, and implementing a polling mechanism for updates.

## Prerequisites

- SDK foundation completed (001-a-sdk-foundation.md)
- Ameide Core SDK installed and configured
- Authentication bridge functional

## Objectives

1. Load BPMN artifacts from SDK instead of local storage
2. Capture bpmn-js events and translate to SDK commands
3. Execute commands through the SDK's command bus
4. Implement polling for artifact updates
5. Handle loading states and errors gracefully

## Technical Implementation

### 1. BPMN Command Translator (`lib/ameide/bpmn/translator.ts`)

Create a translator that converts bpmn-js events to Ameide SDK commands:

```typescript
import { 
  BPMNCommandBuilder,
  BpmnElementType,
  BpmnTaskType,
  BpmnGatewayType,
  BpmnEventType,
  BpmnConnectionType,
  type Command
} from '@ameide/sdk';

export class BpmnEventTranslator {
  constructor(
    private aggregateId: string,
    private userId: string
  ) {}

  translateEvent(event: any): Command | null {
    // All commands should use CommandBuilder for consistency
    const baseCommand = this.createBaseCommand();
    switch (event.command) {
      case 'shape.create':
        return this.translateShapeCreate(event);
      
      case 'shape.move':
        return this.translateShapeMove(event);
      
      case 'element.updateLabel':
        return this.translateLabelUpdate(event);
      
      case 'connection.create':
        return this.translateConnectionCreate(event);
      
      case 'shape.delete':
        return this.translateShapeDelete(event);
      
      // Additional bpmn-js operations to handle or ignore
      case 'connection.updateWaypoints':
        console.log('Waypoint updates not yet supported, ignoring');
        return null;
      
      case 'canvas.resize':
        console.log('Canvas resize not relevant for server, ignoring');
        return null;
      
      case 'element.rotate':
        console.log('Element rotation not yet supported, ignoring');
        return null;
      
      default:
        console.warn(`Unhandled bpmn-js event: ${event.command}`);
        return null;
    }
  }

  private translateShapeCreate(event: any): Command {
    const shape = event.context.shape;
    const elementType = this.mapBpmnJsType(shape.type);
    
    return BPMNCommandBuilder.createBpmnElement(
      this.aggregateId,
      this.userId,
      {
        id: shape.id,
        type: elementType,
        name: shape.businessObject.name || '',
        position: {
          x: shape.x,
          y: shape.y,
        },
        properties: this.getElementProperties(shape),
      }
    );
  }

  private translateShapeMove(event: any): Command {
    const shape = event.context.shape;
    const delta = event.context.delta;
    
    return BPMNCommandBuilder.moveBpmnElement(
      this.aggregateId,
      this.userId,
      shape.id,
      {
        x: shape.x + delta.x,
        y: shape.y + delta.y,
      }
    );
  }

  private translateLabelUpdate(event: any): Command {
    const element = event.context.element;
    const newLabel = event.context.newLabel;
    
    return BPMNCommandBuilder.updateBpmnElement(
      this.aggregateId,
      this.userId,
      element.id,
      {
        name: newLabel,
      }
    );
  }

  private translateConnectionCreate(event: any): Command {
    const connection = event.context.connection;
    
    return BPMNCommandBuilder.connectBpmnElements(
      this.aggregateId,
      this.userId,
      {
        connectionId: connection.id,
        sourceId: connection.source.id,
        targetId: connection.target.id,
        connectionType: this.mapConnectionType(connection.type),
        waypoints: connection.waypoints?.map((wp: any) => ({
          x: wp.x,
          y: wp.y,
        })),
      }
    );
  }

  private translateShapeDelete(event: any): Command {
    const shape = event.context.shape;
    
    return BPMNCommandBuilder.deleteBpmnElement(
      this.aggregateId,
      this.userId,
      shape.id
    );
  }

  private mapBpmnJsType(type: string): BpmnElementType {
    const typeMap: Record<string, BpmnElementType> = {
      'bpmn:Task': BpmnElementType.TASK,
      'bpmn:UserTask': BpmnElementType.TASK,
      'bpmn:ServiceTask': BpmnElementType.TASK,
      'bpmn:ScriptTask': BpmnElementType.TASK,
      'bpmn:ExclusiveGateway': BpmnElementType.EXCLUSIVE_GATEWAY,
      'bpmn:ParallelGateway': BpmnElementType.PARALLEL_GATEWAY,
      'bpmn:InclusiveGateway': BpmnElementType.INCLUSIVE_GATEWAY,
      'bpmn:EventBasedGateway': BpmnElementType.EVENT_BASED_GATEWAY,
      'bpmn:StartEvent': BpmnElementType.START_EVENT,
      'bpmn:EndEvent': BpmnElementType.END_EVENT,
      'bpmn:IntermediateCatchEvent': BpmnElementType.INTERMEDIATE_CATCH_EVENT,
      'bpmn:IntermediateThrowEvent': BpmnElementType.INTERMEDIATE_THROW_EVENT,
      'bpmn:BoundaryEvent': BpmnElementType.BOUNDARY_EVENT,
      'bpmn:SubProcess': BpmnElementType.SUB_PROCESS,
      'bpmn:Pool': BpmnElementType.POOL,
      'bpmn:Lane': BpmnElementType.LANE,
    };
    
    return typeMap[type] || BpmnElementType.UNSPECIFIED;
  }

  private mapConnectionType(type: string): BpmnConnectionType {
    const typeMap: Record<string, BpmnConnectionType> = {
      'bpmn:SequenceFlow': BpmnConnectionType.SEQUENCE_FLOW,
      'bpmn:MessageFlow': BpmnConnectionType.MESSAGE_FLOW,
      'bpmn:Association': BpmnConnectionType.ASSOCIATION,
      'bpmn:DataAssociation': BpmnConnectionType.DATA_ASSOCIATION,
    };
    
    return typeMap[type] || BpmnConnectionType.UNSPECIFIED;
  }

  private getElementProperties(shape: any): any {
    const businessObject = shape.businessObject;
    const elementType = this.mapBpmnJsType(shape.type);
    
    switch (elementType) {
      case BpmnElementType.TASK:
        return {
          taskProps: {
            taskType: this.getTaskType(businessObject),
            isForCompensation: businessObject.isForCompensation || false,
            assignee: businessObject.assignee,
            candidateGroups: businessObject.candidateGroups,
            dueDate: businessObject.dueDate,
          },
        };
      
      case BpmnElementType.EXCLUSIVE_GATEWAY:
      case BpmnElementType.PARALLEL_GATEWAY:
      case BpmnElementType.INCLUSIVE_GATEWAY:
        return {
          gatewayProps: {
            gatewayType: this.getGatewayType(elementType),
            defaultFlow: businessObject.default?.id,
          },
        };
      
      default:
        return {};
    }
  }

  private getTaskType(businessObject: any): BpmnTaskType {
    const taskTypeMap: Record<string, BpmnTaskType> = {
      'bpmn:UserTask': BpmnTaskType.USER_TASK,
      'bpmn:ServiceTask': BpmnTaskType.SERVICE_TASK,
      'bpmn:ScriptTask': BpmnTaskType.SCRIPT_TASK,
      'bpmn:SendTask': BpmnTaskType.SEND_TASK,
      'bpmn:ReceiveTask': BpmnTaskType.RECEIVE_TASK,
      'bpmn:ManualTask': BpmnTaskType.MANUAL_TASK,
      'bpmn:BusinessRuleTask': BpmnTaskType.BUSINESS_RULE_TASK,
    };
    
    return taskTypeMap[businessObject.$type] || BpmnTaskType.UNSPECIFIED;
  }

  private getGatewayType(elementType: BpmnElementType): BpmnGatewayType {
    const gatewayMap: Record<BpmnElementType, BpmnGatewayType> = {
      [BpmnElementType.EXCLUSIVE_GATEWAY]: BpmnGatewayType.EXCLUSIVE,
      [BpmnElementType.PARALLEL_GATEWAY]: BpmnGatewayType.PARALLEL,
      [BpmnElementType.INCLUSIVE_GATEWAY]: BpmnGatewayType.INCLUSIVE,
      [BpmnElementType.EVENT_BASED_GATEWAY]: BpmnGatewayType.EVENT_BASED,
      [BpmnElementType.COMPLEX_GATEWAY]: BpmnGatewayType.COMPLEX,
    };
    
    return gatewayMap[elementType] || BpmnGatewayType.UNSPECIFIED;
  }
}
```

### 2. Updated BPMN Client (`artifacts/bpmn/client.tsx`)

Key changes to integrate SDK:

```typescript
// Add imports
import { useArtifactPolling } from '@/hooks/use-artifact-polling';
import { BpmnEventTranslator } from '@/lib/ameide/bpmn/translator';
import { createAmeideClientWithSession } from '@/lib/ameide/client';
import { shouldUseSDK } from '@/lib/ameide/features';
import { getArtifactSnapshot } from '@/lib/ameide/queries';

// In the component
const useSDK = shouldUseSDK('bpmn');
const { data: artifactData, error, isLoading } = useArtifactPolling(
  documentId,
  { enabled: useSDK }
);

// Load from SDK
useEffect(() => {
  if (!useSDK || !documentId) return;
  
  async function loadFromSDK() {
    try {
      const snapshot = await getArtifactSnapshot(documentId);
      if (snapshot?.content && modelerRef.current) {
        await modelerRef.current.importXML(snapshot.content);
      }
    } catch (error) {
      console.error('Failed to load BPMN from SDK:', error);
      toast.error('Failed to load diagram');
    }
  }
  
  loadFromSDK();
}, [documentId, useSDK]);

// Capture and execute commands
const captureCommand = useCallback(async (event: any) => {
  if (!useSDK) {
    // Existing local storage logic
    return;
  }
  
  try {
    const translator = new BpmnEventTranslator(documentId, session.user.id);
    const command = translator.translateEvent(event);
    
    if (command) {
      const client = createAmeideClientWithSession(session);
      const result = await client.executeCommand(command);
      
      // Optional: Store command ID for optimistic updates
      setLastCommandId(result.commandId);
    }
  } catch (error) {
    console.error('Failed to execute command:', error);
    toast.error('Failed to save changes');
  }
}, [documentId, session, useSDK]);
```

### 3. Polling Hook (`hooks/use-artifact-polling.ts`)

Implement polling for artifact updates:

```typescript
import useSWR from 'swr';
import { getArtifactSnapshot } from '@/lib/ameide/queries';

interface UseArtifactPollingOptions {
  enabled?: boolean;
  refreshInterval?: number;
  onUpdate?: (data: any) => void;
}

export function useArtifactPolling(
  artifactId: string | null,
  options: UseArtifactPollingOptions = {}
) {
  const {
    enabled = true,
    refreshInterval = 5000, // 5 seconds
    onUpdate,
  } = options;

  const { data, error, isLoading, mutate } = useSWR(
    enabled && artifactId ? `artifact:${artifactId}` : null,
    async () => {
      if (!artifactId) return null;
      
      try {
        const snapshot = await getArtifactSnapshot(artifactId);
        return {
          id: artifactId,
          content: snapshot.content,
          version: snapshot.version,
          lastModified: snapshot.lastModified,
        };
      } catch (error) {
        console.error('Failed to fetch artifact:', error);
        throw error;
      }
    },
    {
      refreshInterval,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      onSuccess: (data, key, config) => {
        if (onUpdate && data) {
          onUpdate(data);
        }
      },
    }
  );

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  };
}
```

### 4. Command Queue for Reliability (`lib/ameide/bpmn/command-queue.ts`)

Implement a command queue to handle network issues:

```typescript
import { Command } from '@ameide/sdk';
import { AmeideClient } from '@ameide/sdk';

export class BpmnCommandQueue {
  private queue: Command[] = [];
  private processing = false;
  private retryCount = new Map<string, number>();
  
  constructor(
    private client: AmeideClient,
    private maxRetries = 3
  ) {}

  async enqueue(command: Command): Promise<void> {
    this.queue.push(command);
    
    if (!this.processing) {
      this.process();
    }
  }

  private async process(): Promise<void> {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const command = this.queue.shift()!;
      const commandId = command.header?.id || '';
      
      try {
        await this.client.executeCommand(command);
        this.retryCount.delete(commandId);
      } catch (error) {
        const retries = this.retryCount.get(commandId) || 0;
        
        if (retries < this.maxRetries) {
          this.retryCount.set(commandId, retries + 1);
          this.queue.unshift(command); // Retry
          await this.backoff(retries);
        } else {
          console.error('Command failed after max retries:', error);
          this.retryCount.delete(commandId);
          // Could emit error event here
        }
      }
    }
    
    this.processing = false;
  }

  private async backoff(retryCount: number): Promise<void> {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
```

### 5. Loading States and Error Handling

Update the BPMN client to show appropriate loading states:

```typescript
// In artifacts/bpmn/client.tsx
if (useSDK && isLoading) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p>Loading diagram...</p>
      </div>
    </div>
  );
}

if (useSDK && error) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-red-600">
        <p className="mb-4">Failed to load diagram</p>
        <button 
          onClick={() => mutate()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
```

## Performance Optimizations

1. **Debounce Commands**: Group rapid changes (e.g., dragging)
2. **Optimistic Updates**: Apply changes locally before server confirmation
3. **Diff-based Updates**: Only send changed properties
4. **Batch Commands**: Send multiple commands in one request

## Testing Strategy

1. **Unit Tests**:
   - Test event translator with various bpmn-js events
   - Test command queue retry logic
   - Test polling hook behavior

2. **Integration Tests**:
   - Test full flow from bpmn-js event to SDK command
   - Test error recovery scenarios
   - Test concurrent editing scenarios

3. **E2E Tests**:
   - Create diagram via chat
   - Edit diagram and verify persistence
   - Test polling updates

## Migration Path

1. Enable SDK with feature flag for testing
2. Run side-by-side with existing implementation
3. Monitor for errors and performance
4. Gradually increase rollout percentage
5. Remove legacy code once stable

## Success Criteria

- [ ] BPMN diagrams load from SDK successfully
- [ ] All diagram edits are captured as commands
- [ ] Commands execute reliably with retry logic
- [ ] Polling updates diagram when changed externally
- [ ] Loading states and errors handled gracefully
- [ ] Performance remains acceptable (< 100ms command execution)
- [ ] No regression in existing functionality

## Dependencies

- SDK foundation (001-a) must be complete
- Ameide Core SDK must support all BPMN command types
- Feature flags must be configured

## Next Steps

After this integration:
1. Implement chat tools SDK integration (001-c)
2. Add WebSocket support for real-time updates
3. Implement conflict resolution for concurrent edits
4. Add command history visualization