"use client";

/**
 * BPMN Artifact Client Component
 * 
 * This component provides a collaborative BPMN 2.0 diagram editor with event sourcing capabilities.
 * 
 * Technical Challenges:
 * - BPMN-js has module duplication issues with Turbopack due to the moddle library's global registry pattern
 * - When multiple moddle instances are loaded, type definitions registered in one instance are not
 *   visible to others, causing "failed to parse document as <bpmn:Definitions>" errors
 * - This implementation uses the pre-built bundle to avoid module resolution issues
 * - Use `pnpm dev:webpack` to run with webpack instead of Turbopack for development
 * 
 * Architecture:
 * - Event sourcing ready: Commands are captured but not yet persisted
 * - Real-time collaboration ready: Infrastructure for remote event application is in place
 * - Version history supported through the artifact system
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Artifact } from "@/components/create-artifact";
import { toast } from "sonner";
// Import for future real-time collaboration features
// import useSWR from "swr";

// Import BPMN.js CSS for diagram styling
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

// Additional styles for better editor experience
const editorStyles = `
  .djs-palette {
    position: absolute;
    left: 20px;
    top: 20px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  
  .djs-context-pad,
  .djs-popup {
    z-index: 100;
  }
  
  .bjs-powered-by {
    display: none;
  }
`;

// TypeScript declaration for the pre-built bundle
declare module 'bpmn-js/dist/bpmn-modeler.production.min.js' {
  export default class BpmnModeler {
    constructor(options: any);
    on(event: string, callback: Function): void;
    get(module: string): any;
    importXML(xml: string): Promise<{ warnings: any[] }>;
    saveXML(options?: { format?: boolean }): Promise<{ xml: string }>;
    destroy(): void;
  }
}

/**
 * Metadata stored alongside the BPMN diagram
 * Used for tracking save state and synchronization
 */
interface BpmnMetadata {
  lastSaved: string;              // ISO timestamp of last save
  lastSyncedCommandIdx: number;   // Last command index synced to server (for event sourcing)
}

/**
 * Command structure for event sourcing
 * Each user action is captured as a command that can be replayed
 * 
 * Future implementation will:
 * - Persist commands to a server-side event store
 * - Enable real-time collaboration by streaming commands between users
 * - Support undo/redo across sessions
 * - Allow time-travel debugging and audit trails
 */
interface BpmnCommand {
  id: string;           // Unique command identifier (UUID)
  type: string;         // Command type (e.g., 'shape.create', 'shape.move')
  context: any;         // Command-specific data
  timestamp: number;    // Unix timestamp
  userId: string;       // User who initiated the command
  metadata?: {
    origin: 'user' | 'ai';  // Whether command was user-initiated or AI-generated
    batchId?: string;       // Groups related commands (e.g., bulk operations)
  };
}

// Type for the BPMN Modeler instance
type BpmnModelerInstance = any; // Using any due to dynamic import

/**
 * BPMN Artifact Definition
 * 
 * This artifact type enables BPMN 2.0 diagram creation and editing within the chat interface.
 * It integrates with the artifact system to provide:
 * - Streaming support for AI-generated diagrams
 * - Version history and diffing
 * - Save/load functionality
 * - Metadata tracking
 */
export const bpmnArtifact = new Artifact<"bpmn", BpmnMetadata>({
  kind: "bpmn",
  description: "Collaborative BPMN 2.0 diagrams with event sourcing",

  /**
   * Initialize a new BPMN artifact
   * Sets up initial metadata for tracking saves and synchronization
   * 
   * @param documentId - Unique identifier for the document (unused currently, for future event store)
   * @param setMetadata - Function to set the artifact metadata
   */
  initialize: async ({ setMetadata }) => {
    setMetadata({ 
      lastSaved: new Date().toISOString(),
      lastSyncedCommandIdx: 0  // Starting point for event sourcing
    });
  },

  /**
   * Handle streaming updates from AI
   * 
   * When the AI generates BPMN XML, it streams the content in chunks.
   * This handler accumulates the chunks and makes the diagram visible
   * once enough content has been received (>200 characters).
   * 
   * @param streamPart - Chunk of streamed data
   * @param setArtifact - Function to update the artifact state
   */
  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === 'data-textDelta') {
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + streamPart.data,
          // Make visible once we have enough content for a valid diagram
          isVisible:
            draftArtifact.status === 'streaming' &&
            draftArtifact.content.length > 200
              ? true
              : draftArtifact.isVisible,
          status: 'streaming',
        };
      });
    }
  },

  /**
   * Main content component for the BPMN editor
   * 
   * @param content - BPMN XML content to display/edit
   * @param mode - Display mode ('full' for editing, 'diff' for version comparison)
   * @param onSaveContent - Callback to save updated content
   * @param isCurrentVersion - Whether this is the latest version
   * @param metadata - Artifact metadata (save state, sync info)
   */
  content: ({
    content,
    mode,
    onSaveContent,
    isCurrentVersion,
    metadata,
  }) => {
    // DOM reference for the BPMN diagram container
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Reference to the BPMN modeler instance
    const modelerRef = useRef<BpmnModelerInstance | null>(null);
    
    // Track command index for change detection (future: event sourcing)
    // const [lastCommandIdx, setLastCommandIdx] = useState(0);

    /**
     * Capture commands for event sourcing
     * 
     * This is the foundation for:
     * - Real-time collaboration: Commands can be streamed to other users
     * - Audit trails: Every action is recorded with user and timestamp
     * - Time-travel debugging: Replay commands to reach any state
     * - AI assistance: AI can generate commands that integrate seamlessly
     * 
     * Current status: Phase 1 - Commands are logged to console
     * Future: Phase 2 - Commands will be persisted to an event store
     * 
     * @param event - Command stack event from bpmn-js
     */
    const captureCommand = useCallback((event: any) => {
      if (!event.context) return;
      
      const command: BpmnCommand = {
        id: crypto.randomUUID(),
        type: event.command,       // e.g., 'shape.create', 'connection.updateWaypoints'
        context: event.context,    // Command-specific data (shapes, positions, etc.)
        timestamp: Date.now(),
        userId: 'user',  // TODO: Get from session context
        metadata: {
          origin: event.context.isAiGenerated ? 'ai' : 'user'
        }
      };

      // Phase 1: Log commands for debugging
      console.log("[BPMN Command]", command);
      
      // Phase 2: Send to event store via HTTP POST
      // await fetch('/api/bpmn/commands', { 
      //   method: 'POST', 
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ documentId, command })
      // });
      
      // Phase 3: Broadcast via WebSocket for real-time collaboration
      // ws.send(JSON.stringify({ type: 'command', command }));
    }, []);

    /**
     * Apply remote events to the local diagram
     * 
     * This function is the receiver side of real-time collaboration.
     * It takes commands from other users and applies them to the local diagram.
     * 
     * Key principles:
     * - Uses commandStack.execute to maintain undo/redo integrity
     * - Validates elements exist before applying changes
     * - Handles failures gracefully to prevent diagram corruption
     * 
     * Currently unused but ready for when we implement:
     * - WebSocket connection for real-time updates
     * - Conflict resolution for concurrent edits
     * - Presence indicators showing other users' cursors
     * 
     * @param event - Remote command to apply
     */
    // const applyRemoteEvent = useCallback((event: any) => {
    //   if (!modelerRef.current) return;
    //   
    //   const commandStack = modelerRef.current.get("commandStack");
    //   const elementRegistry = modelerRef.current.get("elementRegistry");
    //   
    //   try {
    //     // Use commandStack.execute to maintain undo/redo integrity
    //     switch (event.type) {
    //       case "shape.create":
    //         commandStack.execute('shape.create', {
    //           shape: event.context.shape,
    //           position: event.context.position,
    //           parent: event.context.parent || elementRegistry.get('Process_1')
    //         });
    //         break;
    //       case "shape.move":
    //         const shapes = event.context.shapes.map((s: any) => 
    //           elementRegistry.get(s.id)
    //         ).filter(Boolean);
    //         if (shapes.length > 0) {
    //           commandStack.execute('elements.move', {
    //             shapes,
    //             delta: event.context.delta
    //           });
    //         }
    //         break;
    //       case "connection.create":
    //         commandStack.execute('connection.create', {
    //           source: elementRegistry.get(event.context.source),
    //           target: elementRegistry.get(event.context.target),
    //           connection: event.context.connection
    //         });
    //         break;
    //       // Add more event types as needed
    //     }
    //   } catch (error) {
    //     console.error("Failed to apply remote event:", error);
    //   }
    // }, []);

    /**
     * Initialize the BPMN modeler
     * 
     * This effect:
     * 1. Dynamically imports the pre-built BPMN.js bundle
     * 2. Creates a new modeler instance
     * 3. Sets up event listeners for commands and keyboard shortcuts
     * 4. Imports the initial diagram content
     * 5. Handles cleanup on unmount
     * 
     * We use dynamic import of the production bundle to:
     * - Avoid module duplication issues with Turbopack
     * - Reduce initial bundle size
     * - Ensure all dependencies are properly bundled
     */
    useEffect(() => {
      // Prevent double initialization
      if (!containerRef.current || modelerRef.current) return;

      const initializeBpmn = async () => {
        try {
          // Dynamic import of pre-built bundle (avoids Turbopack issues)
          const BpmnJS = (await import('bpmn-js/dist/bpmn-modeler.production.min.js')).default;
          
          // Create modeler instance with full editing capabilities
          const modeler = new BpmnJS({ 
            container: containerRef.current,
            width: '100%',
            height: '100%'
          });
          
          modelerRef.current = modeler;
      
          // Phase 2: Set up SWR polling for collaboration
          // const { data: remoteEvents } = useSWR(
          //   `/api/bpmn/events/${documentId}`,
          //   { refreshInterval: 5000 }
          // );

          /**
           * Set up command capture for event sourcing
           * 
           * Listen to all command stack changes except undo/redo
           * (undo/redo are derived from the original commands)
           */
          modeler.on("commandStack.changed", (event: any) => {
            // Skip undo/redo as they're not new commands
            if (event.trigger === "undo" || event.trigger === "redo") return;
            
            // Capture the command for event sourcing
            captureCommand(event);
            
            // Track command count for change detection
            // setLastCommandIdx(prev => prev + 1);
          });

          /**
           * Handle keyboard save shortcut (Cmd/Ctrl + S)
           * 
           * Features:
           * - Change detection: Only saves if there are unsaved changes
           * - User feedback: Toast notifications for save status
           * - Context awareness: Saves to conversation, not repository
           * 
           * Note: This saves to the current chat conversation.
           * To persist to a repository, users must use the "Save to Repository" button.
           */
          const saveHandler = (e: KeyboardEvent) => {
            if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              
              // Get command stack for change detection
              const commandStack = modeler.get("commandStack");
              const currentIdx = commandStack._stackIdx;
              
              // Check if there are unsaved changes
              // TODO: Properly track this once event sourcing is implemented
              if (currentIdx > (metadata?.lastSyncedCommandIdx || 0)) {
                modeler.saveXML({ format: true })
                  .then(({ xml }: { xml: string }) => {
                    onSaveContent(xml, false);
                    toast.success("Diagram saved to conversation");
                  })
                  .catch((err: any) => {
                    toast.error(`Save failed: ${err.message}`);
                  });
              } else {
                toast.info("No changes to save");
              }
            }
          };
          
          window.addEventListener('keydown', saveHandler);

          /**
           * Import the BPMN diagram content
           * 
           * Process:
           * 1. Use provided content or fall back to default template
           * 2. Import XML into the modeler
           * 3. Handle errors with graceful degradation
           * 
           * Error handling:
           * - Log detailed error info for debugging
           * - Try minimal diagram as fallback
           * - Show user-friendly error messages
           * 
           * The delay ensures the modeler is fully initialized before import.
           */
          const importDiagram = async () => {
            try {
              // Small delay to ensure modeler is ready
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Use provided content or default template
              const xmlContent = content || DEFAULT_TEMPLATE_XML;
              console.log("Importing BPMN XML:", xmlContent.substring(0, 200));
              
              // Import the diagram
              await modeler.importXML(xmlContent);
              console.log("BPMN import successful");
              
              // Show helper toast for first-time users
              toast.info("BPMN Editor ready! Drag elements from the palette on the left.", {
                duration: 5000
              });
            } catch (error: any) {
              // Log detailed error for debugging
              console.error("BPMN Import error details:", {
                message: error.message,
                stack: error.stack,
                xml: (content || DEFAULT_TEMPLATE_XML).substring(0, 500)
              });
              
              // Fallback: Try minimal valid diagram
              try {
                const minimalXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" />
</bpmn:definitions>`;
                await modeler.importXML(minimalXML);
                toast.warning("Loaded minimal diagram due to import error");
              } catch (fallbackError: any) {
                // Complete failure - notify user
                toast.error(`Failed to load diagram: ${error.message?.substring(0, 100)}`);
                console.error("Fallback import also failed:", fallbackError);
              }
            }
          };
          
          await importDiagram();

          // Cleanup function
          return () => {
            window.removeEventListener('keydown', saveHandler);
            if (modelerRef.current) {
              modelerRef.current.destroy();
              modelerRef.current = null;
            }
          };
        } catch (error) {
          console.error('Failed to initialize BPMN modeler:', error);
          toast.error('Failed to load BPMN editor');
        }
      };
      
      initializeBpmn();
    }, []); // Only run once

    /**
     * Handle content updates
     * 
     * This effect runs when:
     * - User switches between versions in history
     * - AI updates the diagram content
     * - Content is restored from a save
     * 
     * It re-imports the XML to reflect the new content.
     */
    useEffect(() => {
      if (!modelerRef.current || !content) return;
      
      modelerRef.current.importXML(content).catch((err: any) => {
        toast.error(`Failed to update diagram: ${err.message}`);
      });
    }, [content]);

    /**
     * Diff mode for comparing versions
     * 
     * Future implementation will:
     * - Render both versions as static SVGs
     * - Highlight differences (added/removed/modified elements)
     * - Show property changes in a side panel
     * - Support navigating between changes
     */
    if (mode === "diff") {
      return (
        <div className="grid grid-cols-2 gap-4 h-full">
          <div className="border rounded">
            <h3 className="p-2 border-b">Previous Version</h3>
            {/* TODO: Render previous version as SVG */}
            <div className="p-4 text-gray-500">
              Version comparison not yet implemented
            </div>
          </div>
          <div className="border rounded">
            <h3 className="p-2 border-b">Current Version</h3>
            {/* TODO: Render current version as SVG */}
            <div className="p-4 text-gray-500">
              Version comparison not yet implemented
            </div>
          </div>
        </div>
      );
    }

    /**
     * Main editor view
     * 
     * Layout:
     * - Full-size container for the BPMN diagram
     * - White background (dark mode uses light gray for better visibility)
     * - Status indicator showing last save time
     * 
     * The container ref is where BPMN.js renders the interactive diagram.
     */
    return (
      <div className="relative h-full w-full overflow-hidden">
        {/* Inject editor styles */}
        <style dangerouslySetInnerHTML={{ __html: editorStyles }} />
        
        {/* BPMN diagram container */}
        <div 
          ref={containerRef} 
          className="h-full w-full bg-white dark:bg-gray-50 bpmn-editor-container" 
          style={{ minHeight: '400px', position: 'relative' }}
        />
        
        {/* Save status indicator - only shown for current version */}
        {isCurrentVersion && (
          <span className="absolute bottom-2 right-4 text-xs text-zinc-500 z-10">
            Last saved {new Date(metadata?.lastSaved || Date.now()).toLocaleString()}
          </span>
        )}
      </div>
    );
  },

  /**
   * Custom actions for the artifact
   * 
   * Future actions could include:
   * - Export to various formats (SVG, PNG, PDF)
   * - Validate against BPMN 2.0 specification
   * - Generate process documentation
   * - Import from other diagram formats
   */
  actions: [],
  
  /**
   * Custom toolbar items
   * 
   * Future toolbar items could include:
   * - Zoom controls
   * - Layout tools (auto-arrange)
   * - Collaboration indicators
   * - Simulation controls
   */
  toolbar: [],
});

/**
 * Default BPMN 2.0 XML template
 * 
 * This template provides a complete example process demonstrating:
 * - Start and end events
 * - User and service tasks
 * - Exclusive gateway (decision point)
 * - Parallel gateway (concurrent execution)
 * - Sequence flows with conditions
 * - Proper layout and positioning
 * 
 * The example models a simple order processing workflow:
 * 1. Start → Check inventory
 * 2. Decision: If in stock → Process payment (parallel with Ship order)
 * 3. If not in stock → Notify customer → End
 * 4. After payment and shipping → End
 */
const DEFAULT_TEMPLATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1" targetNamespace="http://example.com/bpmn">
  
  <bpmn:process id="Process_OrderFulfillment" name="Order Fulfillment Process" isExecutable="true">
    
    <!-- Start Event -->
    <bpmn:startEvent id="StartEvent_1" name="Order Received">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    
    <!-- Check Inventory Task -->
    <bpmn:serviceTask id="Task_CheckInventory" name="Check Inventory">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    
    <!-- Exclusive Gateway - Stock Decision -->
    <bpmn:exclusiveGateway id="Gateway_StockDecision" name="In Stock?">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_InStock</bpmn:outgoing>
      <bpmn:outgoing>Flow_OutOfStock</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    
    <!-- Parallel Gateway - Split -->
    <bpmn:parallelGateway id="Gateway_Parallel_Split">
      <bpmn:incoming>Flow_InStock</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:parallelGateway>
    
    <!-- Process Payment -->
    <bpmn:serviceTask id="Task_ProcessPayment" name="Process Payment">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:serviceTask>
    
    <!-- Ship Order -->
    <bpmn:userTask id="Task_ShipOrder" name="Ship Order">
      <bpmn:incoming>Flow_4</bpmn:incoming>
      <bpmn:outgoing>Flow_6</bpmn:outgoing>
    </bpmn:userTask>
    
    <!-- Parallel Gateway - Join -->
    <bpmn:parallelGateway id="Gateway_Parallel_Join">
      <bpmn:incoming>Flow_5</bpmn:incoming>
      <bpmn:incoming>Flow_6</bpmn:incoming>
      <bpmn:outgoing>Flow_7</bpmn:outgoing>
    </bpmn:parallelGateway>
    
    <!-- Notify Customer - Out of Stock -->
    <bpmn:userTask id="Task_NotifyCustomer" name="Notify Customer">
      <bpmn:incoming>Flow_OutOfStock</bpmn:incoming>
      <bpmn:outgoing>Flow_8</bpmn:outgoing>
    </bpmn:userTask>
    
    <!-- End Events -->
    <bpmn:endEvent id="EndEvent_Success" name="Order Fulfilled">
      <bpmn:incoming>Flow_7</bpmn:incoming>
    </bpmn:endEvent>
    
    <bpmn:endEvent id="EndEvent_Cancelled" name="Order Cancelled">
      <bpmn:incoming>Flow_8</bpmn:incoming>
    </bpmn:endEvent>
    
    <!-- Sequence Flows -->
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_CheckInventory" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_CheckInventory" targetRef="Gateway_StockDecision" />
    <bpmn:sequenceFlow id="Flow_InStock" name="Yes" sourceRef="Gateway_StockDecision" targetRef="Gateway_Parallel_Split">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">inStock == true</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_OutOfStock" name="No" sourceRef="Gateway_StockDecision" targetRef="Task_NotifyCustomer">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">inStock == false</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_Parallel_Split" targetRef="Task_ProcessPayment" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_Parallel_Split" targetRef="Task_ShipOrder" />
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task_ProcessPayment" targetRef="Gateway_Parallel_Join" />
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Task_ShipOrder" targetRef="Gateway_Parallel_Join" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Gateway_Parallel_Join" targetRef="EndEvent_Success" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Task_NotifyCustomer" targetRef="EndEvent_Cancelled" />
    
  </bpmn:process>
  
  <!-- BPMN Diagram -->
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_OrderFulfillment">
      
      <!-- Start Event -->
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="152" y="252" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="132" y="295" width="76" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      
      <!-- Check Inventory -->
      <bpmndi:BPMNShape id="Task_CheckInventory_di" bpmnElement="Task_CheckInventory">
        <dc:Bounds x="240" y="230" width="100" height="80" />
      </bpmndi:BPMNShape>
      
      <!-- Stock Decision Gateway -->
      <bpmndi:BPMNShape id="Gateway_StockDecision_di" bpmnElement="Gateway_StockDecision" isMarkerVisible="true">
        <dc:Bounds x="395" y="245" width="50" height="50" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="395" y="215" width="51" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      
      <!-- Parallel Split -->
      <bpmndi:BPMNShape id="Gateway_Parallel_Split_di" bpmnElement="Gateway_Parallel_Split">
        <dc:Bounds x="525" y="245" width="50" height="50" />
      </bpmndi:BPMNShape>
      
      <!-- Process Payment -->
      <bpmndi:BPMNShape id="Task_ProcessPayment_di" bpmnElement="Task_ProcessPayment">
        <dc:Bounds x="630" y="160" width="100" height="80" />
      </bpmndi:BPMNShape>
      
      <!-- Ship Order -->
      <bpmndi:BPMNShape id="Task_ShipOrder_di" bpmnElement="Task_ShipOrder">
        <dc:Bounds x="630" y="320" width="100" height="80" />
      </bpmndi:BPMNShape>
      
      <!-- Parallel Join -->
      <bpmndi:BPMNShape id="Gateway_Parallel_Join_di" bpmnElement="Gateway_Parallel_Join">
        <dc:Bounds x="785" y="245" width="50" height="50" />
      </bpmndi:BPMNShape>
      
      <!-- Notify Customer -->
      <bpmndi:BPMNShape id="Task_NotifyCustomer_di" bpmnElement="Task_NotifyCustomer">
        <dc:Bounds x="500" y="410" width="100" height="80" />
      </bpmndi:BPMNShape>
      
      <!-- End Events -->
      <bpmndi:BPMNShape id="EndEvent_Success_di" bpmnElement="EndEvent_Success">
        <dc:Bounds x="892" y="252" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="875" y="295" width="70" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      
      <bpmndi:BPMNShape id="EndEvent_Cancelled_di" bpmnElement="EndEvent_Cancelled">
        <dc:Bounds x="672" y="432" width="36" height="36" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="651" y="475" width="78" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      
      <!-- Sequence Flows -->
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="270" />
        <di:waypoint x="240" y="270" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="340" y="270" />
        <di:waypoint x="395" y="270" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_InStock_di" bpmnElement="Flow_InStock">
        <di:waypoint x="445" y="270" />
        <di:waypoint x="525" y="270" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="476" y="252" width="18" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_OutOfStock_di" bpmnElement="Flow_OutOfStock">
        <di:waypoint x="420" y="295" />
        <di:waypoint x="420" y="450" />
        <di:waypoint x="500" y="450" />
        <bpmndi:BPMNLabel>
          <dc:Bounds x="428" y="370" width="15" height="14" />
        </bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="550" y="245" />
        <di:waypoint x="550" y="200" />
        <di:waypoint x="630" y="200" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="550" y="295" />
        <di:waypoint x="550" y="360" />
        <di:waypoint x="630" y="360" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_5_di" bpmnElement="Flow_5">
        <di:waypoint x="730" y="200" />
        <di:waypoint x="810" y="200" />
        <di:waypoint x="810" y="245" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_6_di" bpmnElement="Flow_6">
        <di:waypoint x="730" y="360" />
        <di:waypoint x="810" y="360" />
        <di:waypoint x="810" y="295" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_7_di" bpmnElement="Flow_7">
        <di:waypoint x="835" y="270" />
        <di:waypoint x="892" y="270" />
      </bpmndi:BPMNEdge>
      
      <bpmndi:BPMNEdge id="Flow_8_di" bpmnElement="Flow_8">
        <di:waypoint x="600" y="450" />
        <di:waypoint x="672" y="450" />
      </bpmndi:BPMNEdge>
      
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;