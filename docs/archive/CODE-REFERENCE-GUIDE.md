# Stentorosaur System-Centric Architecture: Code Reference Guide

## Quick Index of System-Centric Assumptions

### Type Definition Locations

| Type | Location | System Assumption |
|------|----------|-------------------|
| `StatusItem` | src/types.ts:33-42 | `name` field is unique system identifier |
| `StatusIncident` | src/types.ts:44-58 | `affectedSystems: string[]` links to system names |
| `ScheduledMaintenance` | src/types.ts:66-77 | `affectedSystems: string[]` links to system names |
| `StatusData` | src/types.ts:255-266 | `items: StatusItem[]` represents flat system list |
| `SystemStatusFile` | src/types.ts:17-31 | `name` field must match StatusItem.name |

### Configuration

| Setting | Location | System Meaning |
|---------|----------|----------------|
| `systemLabels` | src/options.ts:14,57 | Array of system identifiers (from GitHub labels) |
| `DEFAULT_OPTIONS.systemLabels` | src/options.ts:14 | Defaults to empty array `[]` |

## Issue-to-System Linking

### Entry Point: GitHub Service

```text
File: src/github-service.ts
Class: GitHubStatusService
```

#### Key Methods

**1. Constructor (Line 47-63)**

- Takes `systemLabels: string[]` - these define what systems exist
- Stored as `this.systemLabels` - used throughout for linking

**2. fetchStatusIssues() (Line 68-87)**

- Fetches issues with `statusLabel` (default: "status")
- Returns all matching issues, regardless of other labels

**3. convertIssueToIncident() (Line 92-131)**

```typescript
// Line 105-108: THE CRITICAL LINK
const affectedSystems = labels.filter((label) =>
  this.systemLabels.includes(label)
);
```

**This is where GitHub issue labels → system names**

- Takes all issue labels
- Keeps only those that exist in `systemLabels`
- Result: `affectedSystems: string[]` with system names

**4. generateStatusItems() (Line 136-178)**

```typescript
// Line 139-146: Initialize ALL configured systems
for (const system of this.systemLabels) {
  systemsMap.set(system, {
    name: system,
    status: 'up',
    incidentCount: 0,
  });
}

// Line 149-175: Update status based on open incidents
for (const incident of incidents) {
  if (incident.status === 'open') {
    for (const system of incident.affectedSystems) {
      // Update system status (worst-case wins)
    }
  }
}
```

**Key Points:**

- Systems come from `systemLabels` (line 140)
- Only open incidents processed (line 150)
- Status hierarchy: critical → down, major/minor → degraded, maintenance → maintenance
- Closed incidents completely ignored

### Data Flow

```text
GitHub Issues
    ↓
fetchStatusIssues()
    ↓
convertIssueToIncident() ← Line 106-108: Labels → affectedSystems
    ↓
generateStatusItems() ← Line 140: Initialize from systemLabels
    ↓
StatusItem[] with status based on affectedSystems
```

## Monitoring Data Organization

### File: src/index.ts

#### Key Functions

**1. convertReadingsToSystemFiles() (Line 77-126)**

```typescript
// Line 81: Group readings by SYSTEM (svc field)
if (!systemMap.has(reading.svc)) {
  systemMap.set(reading.svc, []);
}
systemMap.get(reading.svc)!.push(reading);

// Line 89: Iterate over systems
for (const [systemName, systemReadings] of systemMap.entries()) {
  // Create SystemStatusFile with systemName
  systemFiles.push({
    name: systemName,  // ← Must match StatusItem.name
    ...
  });
}
```

**Key Point:** Grouping key is `svc` (service name) = system name

**2. readSystemFiles() (Line 21-72)**

- Reads `status-data/systems/` directory
- Expects one `.json` file per system
- Returns array of partial StatusItem data

**3. Plugin loadContent() (Line 198-514)**

**Section 1: Current.json reading (Line 232-360)**

```typescript
// Line 247: Group readings by system
const systemMap = new Map<string, any[]>();
for (const reading of currentData) {
  if (!systemMap.has(reading.svc)) {
    systemMap.set(reading.svc, []);
  }
}

// Line 256: Process each system
for (const [systemName, readings] of systemMap.entries()) {
  items.push({
    name: systemName,  // ← Becomes StatusItem.name
    status: latest.state,
    responseTime: avgResponseTime,
    uptime: uptimePercentage,
  });
}
```

**Key Points:**

- `svc` field must match some system identifier
- One item per `svc` value
- If you have monitoring data for undefined systems, they'll appear

**Section 2: GitHub API fallback (Line 333-352)**

```typescript
if (token && !shouldUseDemoData && incidents.length === 0) {
  const service = new GitHubStatusService(...);
  const result = await service.fetchStatusData();
  incidents = result.incidents;
}
```

**Section 3: System files merge (Line 407-445)**

```typescript
// Read system/*.json files
const systemFileData = await readSystemFiles(systemsDir);

// Merge with GitHub data
items = items.map(item => {
  const systemData = systemDataMap.get(item.name);  // ← Lookup by name
  if (systemData) {
    return { ...item, ...systemData };  // ← Merge
  }
  return item;
});
```

### File Organization

**Source Files:**

```text
status-data/
├── current.json              # Time-series readings with `svc` field
├── incidents.json            # StatusIncident[] with `affectedSystems`
├── maintenance.json          # ScheduledMaintenance[] with `affectedSystems`
└── archives/                 # Historical readings
    └── 2025/11/
        ├── history-2025-11-01.jsonl.gz
        └── history-2025-11-02.jsonl.gz
```

**Build Output:**

```text
build/status-data/
├── status.json              # Complete StatusData
├── current.json             # Copied from source
├── incidents.json           # Copied from source
├── maintenance.json         # Copied from source
├── systems/                 # Generated from current.json
│   ├── api.json            # One per system (from current.json)
│   ├── website.json
│   └── database.json
└── archives/               # Copied from source
```

## Routing: System-Specific Pages

### File: src/index.ts, contentLoaded() (Line 516-563)

**Route Creation:**

```typescript
// Line 547-554: Create slug from system name
const systemsToRoute = content.items.map(item => ({
  name: item.name,
  slug: item.name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')     // Remove special chars
    .replace(/\s+/g, '-')              // Spaces → hyphens
    .replace(/-+/g, '-'),              // Multiple hyphens → single
}));

// Line 556-562: Create route for each system
systemsToRoute.forEach(({name, slug}) => {
  addRoute({
    path: normalizeUrl([baseUrl, 'status', 'history', slug]),
    component: '@theme/StatusHistory',
    exact: true,
  });
});
```

**Key Points:**

- One route per system in `content.items`
- Route path = `/status/history/{slug}`
- Slug generated from system name with consistent algorithm
- StatusHistory component extracts slug from URL path

## Component Layer

### StatusBoard (src/theme/StatusBoard/index.tsx)

```typescript
interface Props {
  items: StatusItemType[];              // Array of systems
  incidents?: StatusIncident[];
  maintenance?: ScheduledMaintenance[];
  onSystemClick?: (systemName: string) => void;
  hasSystemData?: (systemName: string) => boolean;
}

// Line 61: Iterate over systems
items.map((item, index) => {
  return (
    <StatusItem
      key={`${item.name}-${index}`}
      item={item}                        // ← System data
      incidents={incidents}              // ← All incidents
      maintenance={maintenance}          // ← All maintenance
      onClick={...handleSystemClick}
    />
  );
})
```

**Key Points:**

- Displays one card per system (item)
- Passes system name to click handler
- All incidents shown (filtered by component)

### StatusPage (src/theme/StatusPage/index.tsx)

**Data Loading (Line 41-127):**
```typescript
// Load current.json
const response = await fetch('/status-data/current.json');
const data = await response.json();

// Group by system
const serviceMap = new Map<string, typeof readings>();
for (const reading of readings) {
  const key = reading.svc.toLowerCase();  // ← System key
  serviceMap.set(key, []);
}

// Create SystemStatusFile for each system in items
for (const item of items) {
  const serviceReadings = serviceMap.get(item.name.toLowerCase());
  if (serviceReadings) {
    files.push({
      name: item.name,
      ...
    });
  }
}
```

**System Click Handler (Line 130-146):**
```typescript
const handleSystemClick = (systemName: string) => {
  if (!showPerformanceMetrics) return;
  
  const index = systemFiles.findIndex(
    (file) => file.name === systemName  // ← Lookup by name
  );
  
  if (index === -1) return;  // No data for this system
  
  setActiveSystemIndex(index);
};
```

**Metrics Display (Line 174-183):**
```typescript
{showPerformanceMetrics && activeSystemIndex !== null && 
  <PerformanceMetrics
    systemFile={systemFiles[activeSystemIndex]}  // ← Single system file
    incidents={incidents}
    maintenance={maintenance}
  />
}
```

### StatusHistory (src/theme/StatusHistory/index.tsx)

**Route-to-System Mapping (Line 28-53):**
```typescript
// Extract system name from URL
const pathParts = window.location.pathname.split('/');
const systemName = pathParts[pathParts.length - 1];  // ← URL slug

// Convert slug → filename
const fileName = systemName
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-');

// Load system-specific file
const response = await fetch(`/${dataPath}/systems/${fileName}.json`);
const data: SystemStatusFile = await response.json();
```

**Key Point:** Slug from URL → file lookup → system-specific data

### PerformanceMetrics (src/theme/PerformanceMetrics/index.tsx)

```typescript
interface PerformanceMetricsProps {
  systemFile: SystemStatusFile;              // Data for ONE system
  incidents?: StatusIncident[];              // All incidents
  maintenance?: ScheduledMaintenance[];      // All maintenance
}

// Line 69: Render for specific system
<section data-system={systemFile.name}>
  <h3>Performance Metrics - {systemFile.name}</h3>
  
  {/* Charts use systemFile.history */}
  <ResponseTimeChart data={systemFile.history} />
  <UptimeChart data={systemFile.history} />
  <SLIChart data={systemFile.history} />
</section>
```

**Key Point:** Charts operate on single system's historical data

## Demo Data

### File: src/demo-data.ts

**Demo Status Items (Line 28-80):**

```typescript
const items: StatusItem[] = [
  { name: 'Main Website', status: 'up', ... },
  { name: 'API Service', status: 'up', ... },
  { name: 'Documentation', status: 'up', ... },
  { name: 'Build & CI/CD', status: 'degraded', ... },
  { name: 'CDN', status: 'up', ... },
];
```

**Demo Incidents (Line 82-125):**

```typescript
const incidents: StatusIncident[] = [
  {
    id: 1,
    title: 'Build System Performance Degradation',
    affectedSystems: ['Build & CI/CD'],        // ← References system name
    ...
  },
  {
    id: 2,
    affectedSystems: ['API Service', 'Main Website'],
    ...
  },
];
```

**Key Point:** Demo incidents reference demo system names exactly

## Summary: File Dependencies

```text
src/types.ts                                  ← Define StatusItem, StatusIncident
    ↓
src/github-service.ts                         ← Link GitHub issues to systems
    ├─ fetchStatusIssues()
    ├─ convertIssueToIncident()               ← Line 106-108: Label matching
    └─ generateStatusItems()                  ← Line 140: Initialize from systemLabels

src/index.ts                                  ← Orchestrate data flow
    ├─ loadContent()
    │   ├─ current.json reading                ← Line 247-257: Group by svc
    │   └─ GitHub API fetch                    ← Line 333-352: Fallback
    ├─ contentLoaded()                         ← Line 547-562: Create routes
    └─ postBuild()                             ← Generate system files

src/theme/StatusPage/index.tsx               ← Main display
    ├─ Load current.json
    ├─ Group readings by system
    └─ Load system/*.json files

src/theme/StatusHistory/index.tsx            ← System-specific page
    ├─ Extract system name from URL
    ├─ Load /status-data/systems/{name}.json
    └─ Display charts for system

src/theme/StatusBoard/index.tsx              ← System list display
    └─ Iterate over items (systems)

src/theme/PerformanceMetrics/index.tsx       ← System metrics
    └─ Charts for single system
```

## Critical System Name Matching Points

| Component | Line(s) | Check |
|-----------|---------|-------|
| GitHub Service | 106-108 | Issue labels must match systemLabels |
| Status Generation | 140 | Initialize all systemLabels as systems |
| Status Calculation | 151-175 | Only process open incidents |
| Current.json Grouping | 247-257 | Group by `svc` field |
| Route Creation | 547-554 | System name → slug conversion |
| File Generation | 596-607 | Slug → filename mapping |
| File Loading | 103-108 | Slug → filename reconstruction |
| System Lookup | 135-138 | Match systemName in systemFiles array |

## Validation Points

1. **systemLabels Configuration**

   - File: src/options.ts
   - Must be defined for systems to exist
   - Empty array → no systems

2. **GitHub Issue Labels**

   - File: src/github-service.ts:106-108
   - Must match systemLabels exactly
   - Case-sensitive

3. **Monitoring Data (svc field)**

   - File: src/index.ts:249
   - Must match a system name
   - Or system appears without monitoring data

4. **File Organization**

   - Location: status-data/systems/
   - Filename: system-name-slugified.json
   - Must exist for system to have charts

5. **Route Creation**

   - Location: src/index.ts:557-562
   - One route per item in content.items
   - Slug must be URL-safe (already sanitized)
