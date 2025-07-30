"use client";

// Note: BPMN-js does NOT work with Turbopack due to module resolution issues.
// This implementation only works with webpack.
// To use BPMN artifacts:
// 1. Use `pnpm dev:webpack` for development (NOT `pnpm dev`)
// 2. Or use `pnpm build && pnpm start` for production
// See: https://github.com/bpmn-io/diagram-js/issues/661

import { useEffect, useRef, useState, useCallback } from "react";
import { Artifact } from "@/components/create-artifact";
import { toast } from "sonner";
// Dynamic import to avoid Turbopack module issues
let BpmnModeler: any;
import useSWR from "swr";

// Import BPMN.js CSS
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';

interface BpmnMetadata {
  lastSaved: string;
  lastSyncedCommandIdx: number;
}

interface BpmnCommand {
  id: string;
  type: string;
  context: any;
  timestamp: number;
  userId: string;
  metadata?: {
    origin: 'user' | 'ai';
    batchId?: string;  // For grouping large refactors
  };
}

export const bpmnArtifact = new Artifact<"bpmn", BpmnMetadata>({
  kind: "bpmn",
  description: "Collaborative BPMN 2.0 diagrams with event sourcing",

  initialize: async ({ documentId, setMetadata }) => {
    setMetadata({ 
      lastSaved: new Date().toISOString(),
      lastSyncedCommandIdx: 0
    });
  },

  onStreamPart: ({ streamPart, setArtifact }) => {
    if (streamPart.type === 'data-textDelta') {
      setArtifact((draftArtifact) => {
        return {
          ...draftArtifact,
          content: draftArtifact.content + streamPart.data,
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

  content: ({
    content,
    mode,
    onSaveContent,
    isCurrentVersion,
    metadata,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const modelerRef = useRef<any | null>(null);
    const [lastCommandIdx, setLastCommandIdx] = useState(0);

    // Command capture for event sourcing (future implementation)
    const captureCommand = useCallback((event: any) => {
      if (!event.context) return;
      
      const command: BpmnCommand = {
        id: crypto.randomUUID(),
        type: event.command,
        context: event.context,
        timestamp: Date.now(),
        userId: 'user',  // TODO: Get from session
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
    }, []);

    // Apply remote events to local diagram using commandStack
    const applyRemoteEvent = useCallback((event: any) => {
      if (!modelerRef.current) return;
      
      const commandStack = modelerRef.current.get("commandStack");
      const elementRegistry = modelerRef.current.get("elementRegistry");
      
      try {
        // Use commandStack.execute to maintain undo/redo integrity
        switch (event.type) {
          case "shape.create":
            commandStack.execute('shape.create', {
              shape: event.context.shape,
              position: event.context.position,
              parent: event.context.parent || elementRegistry.get('Process_1')
            });
            break;
          case "shape.move":
            const shapes = event.context.shapes.map((s: any) => 
              elementRegistry.get(s.id)
            ).filter(Boolean);
            if (shapes.length > 0) {
              commandStack.execute('elements.move', {
                shapes,
                delta: event.context.delta
              });
            }
            break;
          case "connection.create":
            commandStack.execute('connection.create', {
              source: elementRegistry.get(event.context.source),
              target: elementRegistry.get(event.context.target),
              connection: event.context.connection
            });
            break;
          // Add more event types as needed
        }
      } catch (error) {
        console.error("Failed to apply remote event:", error);
      }
    }, []);

    // Initialize modeler once
    useEffect(() => {
      if (!containerRef.current || modelerRef.current) return;

      const initModeler = async () => {
        // Dynamic import to avoid Turbopack bundling issues
        if (!BpmnModeler) {
          try {
            // Use the pre-built bundle to avoid module resolution issues
            const module = await import('bpmn-js/dist/bpmn-modeler.development.js');
            BpmnModeler = module.default || (window as any).BpmnJS?.Modeler;
            console.log("BpmnModeler loaded:", typeof BpmnModeler, BpmnModeler);
          } catch (importError) {
            console.error("Failed to import BpmnModeler:", importError);
            throw new Error("Could not load BPMN modeler");
          }
        }

        const modeler = new BpmnModeler({ 
          container: containerRef.current,
          width: '100%',
          height: '100%'
        });
        
        modelerRef.current = modeler;
        console.log("Modeler created with container:", containerRef.current);
      
      // Phase 2: Set up SWR polling for collaboration
      // const { data: remoteEvents } = useSWR(
      //   `/api/bpmn/events/${documentId}`,
      //   { refreshInterval: 5000 }
      // );

      // Capture command stack changes
      modeler.on("commandStack.changed", (event: any) => {
        if (event.trigger === "undo" || event.trigger === "redo") return;
        captureCommand(event);
        setLastCommandIdx(prev => prev + 1);
      });

      // Handle save with change detection
      const saveHandler = (e: KeyboardEvent) => {
        if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          
          // Important: This is an explicit save action, not auto-save
          // In chat context, this saves to the current conversation
          // To save to repository, use "Save to Repository" button
          
          const commandStack = modeler.get("commandStack");
          const currentIdx = commandStack._stackIdx;
          
          if (currentIdx > metadata?.lastSyncedCommandIdx || 0) {
            modeler.saveXML({ format: true })
              .then(({ xml }) => {
                onSaveContent(xml, false);
                toast.success("Diagram saved to conversation");
              })
              .catch((err) => {
                toast.error(`Save failed: ${err.message}`);
              });
          } else {
            toast.info("No changes to save");
          }
        }
      };
      
      window.addEventListener('keydown', saveHandler);

      // Import initial content
      const importDiagram = async () => {
        try {
          // Add a small delay to ensure modeler is fully initialized
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const xmlContent = content || DEFAULT_TEMPLATE_XML;
          console.log("Importing BPMN XML:", xmlContent.substring(0, 200));
          
          await modeler.importXML(xmlContent);
          console.log("BPMN import successful");
        } catch (error: any) {
          console.error("BPMN Import error details:", {
            message: error.message,
            stack: error.stack,
            xml: (content || DEFAULT_TEMPLATE_XML).substring(0, 500)
          });
          
          // Try with a minimal diagram as fallback
          try {
            const minimalXML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" />
</bpmn:definitions>`;
            await modeler.importXML(minimalXML);
            toast.warning("Loaded minimal diagram due to import error");
          } catch (fallbackError: any) {
            toast.error(`Failed to load diagram: ${error.message?.substring(0, 100)}`);
            console.error("Fallback import also failed:", fallbackError);
          }
        }
      };
      
      importDiagram();

        // Store cleanup function reference
        (window as any).__bpmnSaveHandler = saveHandler;
      };

      initModeler();

      // Cleanup
      return () => {
        const handler = (window as any).__bpmnSaveHandler;
        if (handler) {
          window.removeEventListener('keydown', handler);
          delete (window as any).__bpmnSaveHandler;
        }
        if (modelerRef.current) {
          modelerRef.current.destroy();
          modelerRef.current = null;
        }
      };
    }, []); // Only run once

    // Handle content updates (e.g., from version history)
    useEffect(() => {
      if (!modelerRef.current || !content) return;
      
      modelerRef.current.importXML(content).catch((err) => {
        toast.error(`Failed to update diagram: ${err.message}`);
      });
    }, [content]);

    if (mode === "diff") {
      // Visual diff implementation
      return (
        <div className="grid grid-cols-2 gap-4 h-full">
          <div className="border rounded">
            <h3 className="p-2 border-b">Previous Version</h3>
            {/* Render previous version as SVG */}
          </div>
          <div className="border rounded">
            <h3 className="p-2 border-b">Current Version</h3>
            {/* Render current version as SVG */}
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full overflow-hidden">
        <div 
          ref={containerRef} 
          className="h-full w-full bg-white dark:bg-gray-50" 
          style={{ minHeight: '400px' }}
        />
        {isCurrentVersion && (
          <span className="absolute bottom-2 right-4 text-xs text-zinc-500 z-10">
            Last saved {new Date(metadata?.lastSaved || Date.now()).toLocaleString()}
          </span>
        )}
      </div>
    );
  },

  actions: [],
  toolbar: [],
});

const DEFAULT_TEMPLATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_1" targetNamespace="http://example.com/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="180" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;