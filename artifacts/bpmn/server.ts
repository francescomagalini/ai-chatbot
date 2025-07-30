import { createDocumentHandler } from "@/lib/artifacts/server";
import { z } from "zod";

// Size limits for security
const MAX_XML_SIZE = 1024 * 1024; // 1MB
const MAX_ELEMENTS = 10000;

export const bpmnDocumentHandler = createDocumentHandler<"bpmn">({
  kind: "bpmn",

  onCreateDocument: async ({ title, session }) => {
    const processId = title.replace(/[^a-zA-Z0-9_]/g, "_");
    const timestamp = Date.now();
    
    // Return valid BPMN with diagram information
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_${timestamp}" 
  targetNamespace="http://example.com/bpmn"
  exporter="AI-Chatbot BPMN"
  exporterVersion="1.0">
  <bpmn:process id="${processId}" isExecutable="false" name="${title}"/>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processId}"/>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  },

  onUpdateDocument: async ({ document, description, session }) => {
    const content = description ?? document.content;
    
    // Security: Size validation
    if (content.length > MAX_XML_SIZE) {
      throw new Error(`BPMN file too large (max ${MAX_XML_SIZE / 1024}KB)`);
    }
    
    // Basic XML validation - in production we'd use a proper BPMN validator
    if (!content.includes('xmlns:bpmn=') || !content.includes('bpmn:definitions')) {
      throw new Error('Invalid BPMN structure');
    }
    
    return content;
  },
});