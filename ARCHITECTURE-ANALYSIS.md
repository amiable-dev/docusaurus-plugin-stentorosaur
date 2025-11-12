# Stentorosaur Architecture Analysis: System-Centric Design

## Executive Summary

The `docusaurus-plugin-stentorosaur` is built with a **strongly system-centric architecture** where every major component assumes that status data is organized around named systems/services. The design uses systems as the primary organizing principle for:
- Data modeling
- GitHub issue linking (via labels)
- Monitoring and metrics collection
- Routing and UI display

## 1. System-Centric Design Patterns

### 1.1 Core Data Model (src/types.ts)

```typescript
// Systems are the PRIMARY entity
interface StatusItem {
  name: string;  // System identifier - REQUIRED, no alternative
  status: StatusItemStatus;
  responseTime?: number;
  uptime?: string;
  incidentCount?: number;
  history?: StatusCheckHistory[];
}

// Incidents and maintenance LINK TO systems via system names
interface StatusIncident {
  affectedSystems: string[];  // References system names
}

interface ScheduledMaintenance {
  affectedSystems: string[];  // References system names
}
```

**Hard Assumption**: Every entity in the system refers to other entities by system `name`.

### 1.2 Configuration: systemLabels (src/options.ts)

```typescript
interface PluginOptions {
  systemLabels?: string[];  // REQUIRED configuration
}
```

`systemLabels` is the mechanism that defines what systems exist:
- Each label in the array becomes a system
- Issues tagged with these labels are linked to the corresponding system
- Systems without incidents are initialized as "up"
- If `systemLabels` is empty `[]`, no systems can be tracked

**Hard Constraint**: The plugin requires explicit system definition via labels.

## 2. Label-Based System Mapping

### 2.1 Issue-to-System Linking (src/github-service.ts)

```typescript
// Line 106-108: Extract systems from issue labels
const affectedSystems = labels.filter((label) =>
  this.systemLabels.includes(label)
);
```

**Flow**:
1. Fetch issues with `statusLabel` (e.g., "status")
2. For each issue, extract labels matching `systemLabels`
3. These matching labels → `affectedSystems` in StatusIncident
4. Systems without incident labels remain "up"

**Key Constraint**: 
- Labels MUST match exactly (`systemLabels.includes(label)`)
- One issue can affect multiple systems
- Issues without system labels are ignored for status calculation

### 2.2 Status Generation Logic (src/github-service.ts, line 136-178)

```typescript
generateStatusItems(incidents: StatusIncident[]): StatusItem[] {
  const systemsMap = new Map<string, StatusItem>();
  
  // Initialize ALL systems as 'up'
  for (const system of this.systemLabels) {
    systemsMap.set(system, { name: system, status: 'up', ... });
  }
  
  // Process open incidents only
  for (const incident of incidents) {
    if (incident.status === 'open') {
      for (const system of incident.affectedSystems) {
        // Update status: down > degraded > maintenance > up
      }
    }
  }
}
```

**Assumptions**:
- All systems from `systemLabels` are always included (even if no incidents)
- Closed incidents don't affect status (only open ones)
- Status hierarchy: critical=down > major/minor=degraded > maintenance

## 3. Monitoring Data Organization

### 3.1 Compact Monitoring Format (src/index.ts, current.json)

```javascript
// Compact time-series format
[
  { t: 1699000000000, svc: "API Service", state: "up", code: 200, lat: 89 },
  { t: 1699000300000, svc: "API Service", state: "up", code: 200, lat: 92 },
  { t: 1699000000000, svc: "Main Website", state: "up", code: 200, lat: 145 },
]
```

**Key field**: `svc` (service name) = system identifier
- Must match system names from `systemLabels` or configured sites
- Used to group readings by system

### 3.2 System Files (src/index.ts, status-data/systems/{system}.json)

```typescript
interface SystemStatusFile {
  name: string;        // System identifier
  url: string;         // Monitor URL
  currentStatus: StatusItemStatus;
  history: StatusCheckHistory[];
  timeDay?: number;    // 24h avg response time
  uptimeDay?: string;  // 24h uptime %
  // ... more metrics
}
```

Generated for each system, one file per system.

## 4. Routing: System-Specific Pages

### 4.1 Route Generation (src/index.ts, contentLoaded)

```typescript
// Create route for each system
const systemsToRoute = content.items.map(item => ({
  name: item.name,
  slug: item.name.toLowerCase().replace(...),  // URL-safe
}));

systemsToRoute.forEach(({name, slug}) => {
  addRoute({
    path: `/status/history/${slug}`,
    component: '@theme/StatusHistory',
  });
});
```

**Result**: `/status/history/{system-slug}` route per system
- StatusHistory component loads `/status-data/systems/{slug}.json`
- Expects one file per system

## 5. Component Architecture: System-Centric Display

### 5.1 StatusBoard (src/theme/StatusBoard/index.tsx)

```typescript
interface Props {
  items: StatusItemType[];  // Array of systems
  onSystemClick?: (systemName: string) => void;
  hasSystemData?: (systemName: string) => boolean;
}
```

- Iterates over `items` (systems)
- Each system → one StatusItem card
- Click handler: systemName → shows metrics for that system

### 5.2 StatusPage (src/theme/StatusPage/index.tsx)

```typescript
// Load system files for each system
for (const item of items) {  // items = systems
  const fileName = item.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
  const response = await fetch(`/status-data/systems/${fileName}.json`);
}
```

- Loads one file per system
- Maintains map: system.name → SystemStatusFile
- Click system card → shows performance metrics for that system

### 5.3 StatusHistory (src/theme/StatusHistory/index.tsx)

```typescript
// Extract system name from URL
const pathParts = window.location.pathname.split('/');
const systemName = pathParts[pathParts.length - 1];

// Load system-specific file
const response = await fetch(`/${dataPath}/systems/${systemName}.json`);
const data: SystemStatusFile = await response.json();
```

- Route param = system slug → system name
- Load corresponding SystemStatusFile
- Display charts for that one system

### 5.4 PerformanceMetrics (src/theme/PerformanceMetrics/index.tsx)

```typescript
interface PerformanceMetricsProps {
  systemFile: SystemStatusFile;  // Data for ONE system
  incidents?: StatusIncident[];
  maintenance?: ScheduledMaintenance[];
}
```

- Receives data for single system
- Renders response time, uptime, SLI charts
- All charts scoped to one system

## 6. Hard-Coded Assumptions About Systems

### 6.1 Naming and Identification

1. **System names are unique identifiers**
   - Used as file names: `systems/{name}.json`
   - Used as URL slugs: `/status/history/{slug}`
   - Matched against GitHub issue labels
   - Used to group monitoring readings

2. **All systems have performance data**
   - Expectation: one file per system
   - Charts assume system has historical data
   - Missing file → system unclickable

3. **Systems are managed via labels**
   - No alternative definition method (except direct `sites` config)
   - `systemLabels: []` = no systems
   - Cannot define systems without labels

### 6.2 Status Calculation Rules

```typescript
// Status hierarchy (worst-case wins)
if (critical) → down
else if (major || minor) → degraded  
else if (maintenance) → maintenance
else → up
```

- Only looks at **open** incidents
- Closed incidents ignored
- Only severity matters (not affected system count)

## 7. Extension Points (What Could Change)

### 7.1 Current Extension Points

1. **SiteConfig (src/types.ts)**: Alternative to labels
   ```typescript
   sites?: SiteConfig[];  // Direct endpoint config
   ```
   But still generates systems named after `SiteConfig.name`

2. **Swizzleable Components**: Can customize UI
   - StatusBoard
   - StatusItem
   - PerformanceMetrics
   - StatusHistory
   
   But structure remains system-centric

3. **ChartAnnotations**: Can overlay non-system events
   ```typescript
   affectedSystems: string[];  // Still system-based
   ```

### 7.2 What's NOT Easy to Change

1. **Data Model**: StatusItem/StatusIncident/ScheduledMaintenance
   - `affectedSystems: string[]` hardcoded throughout
   - No "generic entity" concept

2. **Issue Linking**: Always label-based
   - No alternative mechanism to link issues to entities
   - No hierarchical grouping (e.g., "service groups")

3. **Routing**: Always system-based
   - `/status/history/{system-slug}` is hardcoded
   - No other entity type routes

4. **Monitoring**: Always keyed by `svc` (service/system name)
   - current.json uses `svc` field
   - No alternative grouping mechanism

## 8. Constraints That Would Need to Change for Alternative Models

### Constraint 1: Single-Level Hierarchy
- Current: Systems → Incidents/Maintenance
- Would need: Categories/Components → Systems → Incidents
- Impact: Add new type layer to all data structures

### Constraint 2: Name-Based Identification
- Current: System "name" is globally unique identifier
- Would need: Hierarchical IDs or UUID system
- Impact: Change all file naming, routing, GitHub linking

### Constraint 3: Label-Based Linking
- Current: GitHub issue labels → system names
- Would need: More flexible label parsing (e.g., "api/auth" → hierarchical)
- Impact: Redesign GitHubStatusService linking logic

### Constraint 4: Flat Status Items Array
- Current: `StatusData.items: StatusItem[]`
- Would need: Nested structure or separate entity types
- Impact: Change all components expecting flat array

### Constraint 5: Per-System Files
- Current: `status-data/systems/{name}.json` per system
- Would need: Support for broader groupings
- Impact: Change file organization, routing, loading logic

## 9. Specific Code Locations of System-Centric Assumptions

| Assumption | Location | Impact |
|-----------|----------|--------|
| systemLabels define systems | src/options.ts, src/index.ts | No systems without config |
| System name = unique ID | src/github-service.ts | Label matching, file names |
| affectedSystems = string[] | src/types.ts | All incidents/maintenance |
| One file per system | src/index.ts postBuild | Routing, file structure |
| Items = systems | src/theme/StatusPage | Component iteration |
| Slug = URL identifier | src/index.ts contentLoaded | Routes, file access |
| Monitor data keyed by svc | src/index.ts | current.json format |
| Only open incidents count | src/github-service.ts | Status calculation |

## 10. Demo Data Pattern

```typescript
const items: StatusItem[] = [
  { name: 'Main Website', status: 'up', ... },
  { name: 'API Service', status: 'up', ... },
  { name: 'Documentation', status: 'up', ... },
];

const incidents: StatusIncident[] = [
  { affectedSystems: ['Build & CI/CD'], ... },
  { affectedSystems: ['API Service', 'Main Website'], ... },
];
```

Demo data reinforces system-centric model:
- Items are systems with hardcoded names
- Incidents reference those system names
- No other entity types

## Summary

**The architecture is fundamentally organized around systems as first-class entities.** Every major component—from data structures to GitHub integration to routing to components—assumes:

1. Systems are defined upfront (via labels)
2. Systems have unique names
3. Incidents/maintenance affect systems (not vice versa)
4. Status is calculated per-system from incidents
5. Each system has performance data in separate files
6. UI routes to individual systems

To support a non-system-centric model (e.g., business processes, features, deployments), you would need to:
- Redesign the data model
- Create a layer of indirection (systems ← entity ← incidents)
- Redesign GitHub integration
- Redesign routing and file organization
- Refactor all components to work with generic entities

