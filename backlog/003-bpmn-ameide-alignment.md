# BPMN Artifact - Ameide Framework Alignment

## Overview

This document tracks the alignment work needed between the BPMN artifact implementation (001-artifact-bpmn.md) and the Ameide Unified Artifact Framework v3 (067-unified-artifact-framework-v3.md).

## Current State

The BPMN artifact implementation is designed for the Next.js AI Chatbot template, while Ameide uses a full event-sourcing architecture with Kafka + PostgreSQL.

## Alignment Areas

### 1. Event Sourcing Architecture

**Ameide Framework**:
- Commands → Kafka → Events → Projections
- Kafka for real-time streaming
- PostgreSQL for snapshots and projections
- Protobuf for serialization

**Current BPMN Implementation**:
- In-memory event store mock
- HTTP POST + SWR polling
- JSON serialization
- No projections

**Alignment Tasks**:
- [ ] Add protobuf definitions for BpmnCommandEnvelope
- [ ] Implement Kafka producer/consumer when available
- [ ] Add projection support for read models
- [ ] Integrate with Ameide's event store interface

### 2. Save vs Edit Distinction

**Ameide Framework**:
- Edit events flow through Kafka (not versioned)
- Save/Publish creates PostgreSQL snapshots (versioned)
- Version only increments on explicit save

**Current BPMN Implementation**:
- All changes saved to artifacts table
- No distinction between edits and saves

**Alignment Tasks**:
- [ ] Separate edit commands from save commands
- [ ] Implement version tracking only on save
- [ ] Add snapshot creation on save/publish
- [ ] Update UI to show save/publish actions

### 3. Domain Envelopes

**Ameide Framework**:
```protobuf
message BpmnCommandEnvelope {
  oneof command {
    CreateBpmnElementCommand create_element = 1;
    UpdateBpmnElementCommand update_element = 2;
    MoveBpmnElementCommand move_element = 3;
    // ...
  }
}
```

**Current BPMN Implementation**:
```typescript
interface BpmnCommand {
  id: string;
  type: string;
  context: any;
  // ...
}
```

**Alignment Tasks**:
- [ ] Generate TypeScript types from protobuf
- [ ] Wrap commands in BpmnCommandEnvelope
- [ ] Use typed command handlers
- [ ] Implement Any packing for cross-domain commands

### 4. Correlation and Causation Tracking

**Ameide Framework**:
- correlation_id: Tracks related operations
- causation_id: Direct cause (command ID)
- Full distributed tracing support

**Current BPMN Implementation**:
- Basic correlation support in mock
- No distributed tracing integration

**Alignment Tasks**:
- [ ] Add correlation ID generation
- [ ] Pass causation ID through command chain
- [ ] Integrate with OpenTelemetry tracing
- [ ] Add correlation to UI for debugging

### 5. Graph Projections

**Ameide Framework**:
- Apache AGE for property graphs
- Graph queries for analysis
- Projections updated via Kafka consumers

**Current BPMN Implementation**:
- Mentions graph storage
- No implementation details

**Alignment Tasks**:
- [ ] Define BPMN graph schema
- [ ] Implement graph projection consumer
- [ ] Add Cypher queries for BPMN analysis
- [ ] Create graph-based UI views

### 6. Multi-Tenant Support

**Ameide Framework**:
- tenant_id in all aggregates
- Row-level security
- Tenant isolation

**Current BPMN Implementation**:
- No multi-tenant support

**Alignment Tasks**:
- [ ] Add tenant_id to commands/events
- [ ] Implement tenant isolation
- [ ] Add tenant context to UI
- [ ] Update auth to include tenant

## Migration Strategy

### Phase 1: API Compatibility (Current)
- In-memory event store with same API
- HTTP transport instead of Kafka
- Single-tenant operation

### Phase 2: Partial Integration
- Add protobuf definitions
- Implement save/edit distinction
- Add correlation tracking
- Keep HTTP transport

### Phase 3: Full Integration
- Switch to Kafka for events
- Enable PostgreSQL snapshots
- Add graph projections
- Multi-tenant support

### Phase 4: Advanced Features
- Real-time WebSocket gateway
- AI command generation
- Branch/merge workflows
- Cross-artifact references

## Technical Debt Items

1. **Transport Layer**: Current HTTP/SWR needs to migrate to Kafka/WebSocket
2. **Serialization**: JSON to Protobuf migration
3. **Storage**: artifacts table to event store migration
4. **Auth**: Session-based to tenant-aware auth

## Success Criteria

- [ ] BPMN artifact can run in both environments (AI Chatbot and Ameide)
- [ ] Commands/events are compatible with Ameide's event store
- [ ] Projections update correctly from BPMN events
- [ ] Graph queries work for BPMN analysis
- [ ] Multi-tenant isolation is enforced

## References

- [001-artifact-bpmn.md](./001-artifact-bpmn.md) - Current implementation
- [067-unified-artifact-framework-v3.md](../ameide-core/backlog/067-unified-artifact-framework-v3.md) - Target architecture
- [Ameide Event Store](../ameide-core/packages/core-storage/src/ameide_core_storage/eventstore/)