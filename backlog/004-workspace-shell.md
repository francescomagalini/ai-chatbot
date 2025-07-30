# Workspace Shell - Unified Architecture

**Status**: 📋 Planned  
**Route**: `app/(workspace)` route group  
**Priority**: High  
**Estimated Effort**: Phased (4 iterations × 1 week each)

## Overview

Extend the existing application with a unified workspace shell that supports both chat and artifact management through a tabbed interface. This approach maximizes code reuse by leveraging existing chat components and infrastructure while incrementally adding enterprise architecture capabilities.

**Key Concept**: Artifacts created in chat need a home in the enterprise repository. When a user creates a BPMN diagram in chat, they must specify (or the system must infer) where it belongs in the repository hierarchy (e.g., `/processes/order-management/order-fulfillment.bpmn`).

**Important Distinction**: 
- **Creation**: Artifacts can be created and edited in chat without being saved (temporary state)
- **Save**: Explicit action (manual button or AI tool call) that commits the artifact to the repository
- **Repository Path**: Only assigned during save action, not creation

## Architecture

```
app/
  layout.tsx                    # Existing providers (Theme, Auth, Analytics)
  (workspace)/                  # New route group
    layout.tsx                  # Tab navigation shell
    page.tsx                    # Redirects to /chat
    chat/page.tsx              # Current chat functionality relocated
    repository/page.tsx        # Artifact browser + editor
```

## Implementation Phases

### Phase 0.1: Repository Browser + Path Selection (5-7 days)
**Visible Change**: Left panel showing artifact tree. Chat artifacts now prompt for repository location.

**Implementation**:
- Create `(workspace)` route group with tab navigation
- Move existing chat to `chat/` tab
- Add repository tree component (Headless UI + Tailwind)
- API: `GET /api/artifacts/tree` endpoint
- Add "Save to Repository" button to artifact UI in chat
- Create `saveToRepository` AI tool for LLM-initiated saves
- Implement path selection dialog with repository browser
- Update saved artifacts to include `repository_path` field

**Deliverable**: 
- Users can browse repository structure
- Artifacts created in chat are properly placed in repository
- Single source of truth for all artifacts

### Phase 0.2: Artifact-Scoped Collaboration (1 week)
**Visible Change**: Right sidebar with presence indicators and artifact-scoped chat.

**Implementation**:
- Add `artifact_id` column to messages table
- Extend chat component with `scope="artifact"` prop
- Reuse `components/user-avatar.tsx` for presence
- Update SWR keys to include artifact scope
- Keep existing polling mechanism (no WebSocket yet)

**Deliverable**: Teams can discuss specific artifacts with full chat history.

### Phase 0.3: Command Capture & Event Sourcing (1 week)
**Visible Change**: Three-pane editor with command history in sidebar.

**Implementation**:
- Add center pane with `react-resizable-panels` (4kb)
- Implement command capture from BPMN editor
- Create `POST /api/artifacts/commands` endpoint
- Dual-write: Save XML + emit BpmnCommandEnvelope
- Display command feed in right sidebar

**Deliverable**: All diagram changes captured as events for future CQRS migration.

### Phase 0.4: AI Integration & Version History (1 week)
**Visible Change**: AI suggestions panel and version timeline.

**Implementation**:
- Add version history component to sidebar
- Implement LLM tools for diagram operations
- Create projection for version snapshots
- Add "Show AI suggestions" toggle
- Reuse existing AI chat infrastructure

**Deliverable**: Full AI-assisted diagram editing with version control.

## Technical Decisions

### UI Components
| Component | Choice | Rationale |
|-----------|---------|-----------|
| Layout | `react-resizable-panels` | Minimal (4kb), SSR-safe, proven |
| Tree View | Headless UI + Tailwind | No new dependencies |
| Chat | Existing chat component | 100% code reuse |
| Presence | Existing user avatars | Zero new code |

### Real-time Strategy
- **Start**: SWR polling (2s interval) - reuse existing infrastructure
- **Monitor**: Track bandwidth usage per user
- **Migrate**: Move to WebSocket/SSE only when polling becomes bottleneck (>2kb/s)

### Event Sourcing Alignment
- Every diagram change produces a `BpmnCommandEnvelope`
- Commands flow to `artifacts.commands` topic (when Kafka available)
- Single consumer writes to PostgreSQL + triggers SWR revalidation
- Maintains compatibility with Unified Artifact Framework v3

## Success Metrics

| Metric | Target |
|--------|--------|
| First usable version | 5-7 days |
| Code reuse | >80% |
| Bundle size increase | <50kb |
| New dependencies | ≤2 |
| Migration complexity | Low (incremental) |

## Benefits

1. **Immediate Value**: Repository browser ships in week 1
2. **Low Risk**: Each phase is independently deployable
3. **Maintainable**: Single codebase, shared components
4. **Future-Proof**: Event sourcing from day one
5. **User-Friendly**: No context switching between apps

## Non-Goals

- Building a separate application
- Implementing WebSocket infrastructure upfront
- Creating duplicate UI components
- Full CQRS implementation in phase 1

## Migration Path

1. **Current State**: Chat at `/`, artifacts in modals
2. **Phase 0.1**: Workspace shell with tabs
3. **Phase 0.4**: Full repository + editor + collaboration
4. **Future**: Kafka integration, WebSocket upgrade, multi-tenant