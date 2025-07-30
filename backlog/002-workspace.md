# Feature Backlog

## Canvas - Enterprise Architecture Repository

**Status**: 📋 Planned  
**Route**: `/canvas`  
**Priority**: High  
**Estimated Effort**: Large (2-3 weeks)

### Overview
Create a dedicated canvas route for navigating and editing artifacts in an enterprise architecture repository. Unlike the chat-centric main app, this provides a repository-centric view where users browse architectural artifacts (BPMN processes, ArchiMate models, system diagrams) with real-time collaboration features.

### Requirements
- Keep existing chat UI at `/` and `/chat` completely untouched
- Create new canvas UI at `/canvas` route
- 3-pane layout: repository browser | artifact editor | collaboration sidebar
- Repository browser shows hierarchical view of enterprise artifacts
- Real-time collaboration chat in right sidebar
- Support architectural artifacts (BPMN, ArchiMate, C4 models)
- Event sourcing for all diagram changes
- Show who's currently viewing/editing each artifact

### Technical Details
- Use `react-resizable-panels` for 3-pane layout
- Repository browser: Tree view of artifacts organized by type/domain
- Artifact editor: Full BPMN editor with event sourcing
- Collaboration sidebar: Real-time chat + presence indicators
- Integrate with event store for command history
- SWR for polling collaboration updates (upgrade to WebSocket later)
- New route completely isolated from chat functionality

### User Stories
1. As an architect, I want to browse all artifacts in a repository tree view
2. As an architect, I want to see artifact relationships and dependencies
3. As a team member, I want to see who else is viewing/editing an artifact
4. As a team member, I want to chat with others working on the same artifact
5. As an architect, I want to see the command history of diagram changes
6. As a user, I want AI assistance while editing diagrams
7. As a team lead, I want to review and approve diagram changes

### Implementation Checklist

#### Core Layout
- [ ] Create `/canvas` route structure (completely separate from chat)
- [ ] Install dependencies (react-resizable-panels, @radix-ui/*)
- [ ] Build 3-pane layout with resizable panels
- [ ] Implement responsive design (desktop-first)

#### Repository Browser (Left Panel)
- [ ] Create hierarchical tree component
- [ ] Implement artifact categorization (BPMN, ArchiMate, C4)
- [ ] Add search and filter capabilities
- [ ] Show artifact metadata (last modified, owner, version)
- [ ] Display presence indicators (who's viewing/editing)

#### Artifact Editor (Center Panel)
- [ ] Integrate BPMN editor with event sourcing
- [ ] Add ArchiMate editor support
- [ ] Implement command history view
- [ ] Add version/save status indicator
- [ ] Show AI command attribution

#### Collaboration Sidebar (Right Panel)
- [ ] Create artifact-scoped chat component
- [ ] Implement presence list (active viewers/editors)
- [ ] Add command history feed
- [ ] Build AI assistant integration
- [ ] Show real-time notifications

#### Backend Integration
- [ ] Create canvas-specific API endpoints
- [ ] Implement artifact repository service
- [ ] Add collaboration message storage
- [ ] Integrate with event store
- [ ] Set up SWR polling for updates

#### Future Enhancements
- [ ] WebSocket for real-time collaboration
- [ ] Approval workflows for changes
- [ ] Cross-artifact dependency visualization
- [ ] Export/import capabilities
- [ ] Integration with external EA tools

### References
- Original migration plan provided by user
- Current chat implementation at `/app/(chat)`
- Existing artifact system in `/components/artifact.tsx`