# ADR-004: Simplified Status Card UX with Composable Components

## Status
APPROVED (with refinements)

## Council Review
Reviewed by LLM Council (2026-01-05) with high confidence tier.
- **Verdict**: Approved - Minimal cards with 90-day bars should be default
- **Conditions**: Must address accessibility, data layer abstraction, and mobile responsiveness

## Context

The current Stentorosaur status page displays detailed system cards with performance metrics, response times, and interactive charts. While comprehensive, this approach presents several UX challenges:

1. **Information Overload**: Users visiting a status page primarily want to know "is it working?" - not detailed performance metrics
2. **Visual Noise**: Detailed metrics compete for attention, making it harder to quickly assess overall system health
3. **Inconsistent with Industry Standards**: Leading status pages (Claude, OpenRouter, GitHub, Atlassian) use simplified collapsed cards with 90-day uptime bars
4. **Limited Composability**: Current components are tightly coupled to the full status page view

### Reference Implementations

**status.claude.com**:
- Clean card-based layout with 4 primary service components
- 90-day SVG uptime bars with color-coded days (green/yellow/red)
- Hover tooltips reveal outage duration and incidents
- Collapsible groups with expand/collapse toggles
- Uptime percentage displayed prominently

**status.openrouter.ai**:
- Component-grouped collapsible sections
- 90-day daily dot/cell grid for each service
- Hierarchical disclosure: collapsed shows aggregate, expanded shows details
- Quick visual pattern recognition for outage trends

### User Needs Analysis

| User Type | Primary Need | Minimal Card Serves? |
|-----------|--------------|---------------------|
| End user checking outage | Current status | Yes |
| SRE investigating incident | Recent pattern + details | Needs quick expand |
| Executive reviewing SLA | 90-day uptime % | Yes |
| Developer debugging | Response times, error rates | Requires expansion |

### Data Availability

Per ADR-002:
- `current.json`: 14-day rolling window of raw readings
- `daily-summary.json`: Aggregated daily stats for 90 days
- Hybrid read pattern merges today's live data with historical summary

## Decision Drivers

1. **Clarity**: Status page should answer "is it working?" in < 1 second
2. **Scannability**: Users should assess all systems at a glance
3. **Progressive Disclosure**: Details available on demand, not by default
4. **Consistency**: Match industry-standard status page patterns
5. **Composability**: Components usable in custom pages and layouts
6. **Accessibility**: Color-independent, keyboard navigable, screen reader friendly
7. **Data Efficiency**: Leverage ADR-002's daily-summary.json for 90-day view

## Decision

**Implement Minimal Cards with 90-Day Bar as Default**

### Visual Design

**Default (Collapsed) View**:
```
┌─────────────────────────────────────────────────────────────┐
│ ● Workflow API                                   Operational │
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
│ 99.98% uptime                              90 days ago  Today│
└─────────────────────────────────────────────────────────────┘
```

**Expanded View** (on click):
```
┌─────────────────────────────────────────────────────────────┐
│ ● Workflow API                               ▼   Operational │
│ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
│ 99.98% uptime                              90 days ago  Today│
├─────────────────────────────────────────────────────────────┤
│ Average Response Time: 145ms    Last Checked: 2 minutes ago │
│                                                              │
│ ┌─────────────────┐ ┌─────────────────┐                     │
│ │ Response Time   │ │ Uptime Chart    │                     │
│ │ [Chart]         │ │ [Chart]         │                     │
│ └─────────────────┘ └─────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Component Architecture

#### Data Layer (Council Feedback: Required)

```typescript
// Abstracts data fetching, caching, and merging
interface StatusDataContextValue {
  dailySummary: DailySummary | null;
  currentStatus: CurrentStatus | null;
  loading: boolean;
  error: Error | null;
  getMerged90Days(serviceName: string): DayStatus[];
  refresh(): Promise<void>;
}

// Provider wraps status page, fetches data ONCE
<StatusDataProvider baseUrl="/status-data">
  <StatusPage>
    {/* Components consume context, don't fetch directly */}
  </StatusPage>
</StatusDataProvider>
```

#### Component Hierarchy

```
<StatusDataProvider>            # Data fetching layer
  <StatusPage>                  # Full page layout
    <StatusHeader />            # Overall status banner
    <SystemCardList>            # Container with grouping support
      <SystemCardGroup>         # Optional grouping (like OpenRouter)
        <SystemCard>            # Compound component
          <SystemCard.Header />       # Name + status badge
          <SystemCard.UptimeBar />    # 90-day bar
          <SystemCard.Details>        # Expanded content
            <SystemCard.Metrics />
            <SystemCard.Charts />
          </SystemCard.Details>
        </SystemCard>
      </SystemCardGroup>
    </SystemCardList>
    <IncidentHistory />
  </StatusPage>
</StatusDataProvider>
```

### Component Specifications

#### 1. `<UptimeBar />` - 90-Day Horizontal Bar

```typescript
interface UptimeBarProps {
  /** Service name for data lookup (uses context) */
  serviceName: string;
  /** Override data for testing/Storybook */
  data?: DayStatus[];
  /** Number of days to display (default: 90, mobile: 30) */
  days?: number;
  /** Height of the bar in pixels (default: 34) */
  height?: number;
  /** Gap between bars in pixels (default: 2) */
  gap?: number;
  /** Show uptime percentage text (default: true) */
  showPercentage?: boolean;
  /** Show date labels (default: true) */
  showDateLabels?: boolean;

  /** Customizable thresholds */
  thresholds?: {
    operational: number; // default: 99
    degraded: number;    // default: 95
  };

  /** Loading/error states */
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;

  /** Accessibility */
  ariaLabel?: string;

  /** Interaction callbacks */
  onDayClick?: (date: string, status: DayStatus) => void;
  onDayHover?: (date: string, status: DayStatus | null) => void;
}

interface DayStatus {
  date: string;           // ISO 8601: "2025-01-15"
  uptimePercent: number;  // 0-100
  incidents: number;
  checksTotal: number;
  checksPassed: number;
  status: 'operational' | 'degraded' | 'outage' | 'no-data';
}
```

**Visual Specifications**:
- Each day: vertical rectangle, flex width, height 34px
- Colors (CSS variables for theming):
  - `--status-operational`: #22C55E (≥99% uptime)
  - `--status-degraded`: #EAB308 (95-99% uptime)
  - `--status-outage`: #EF4444 (<95% uptime)
  - `--status-no-data`: #9CA3AF (no data)
- Hover: Custom popover via Radix UI (not HTML title)
- Gap: 2px, Border radius: 2px per bar

#### 2. `<SystemCard />` - Compound Component Pattern (Council Feedback)

```typescript
interface SystemCardProps {
  /** System identifier */
  name: string;
  /** Display name (optional) */
  displayName?: string;
  /** Current status */
  status: 'up' | 'degraded' | 'down' | 'maintenance';
  /** Enable expand on click (default: true) */
  expandable?: boolean;
  /** Initial expanded state */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expanded/collapsed */
  onExpandChange?: (expanded: boolean) => void;

  /** Semantic heading level (default: 3) */
  headingLevel?: 2 | 3 | 4;
  /** Accessibility label for expand button */
  expandButtonLabel?: string;

  /** Compound component children */
  children?: React.ReactNode;
}

// Compound component sub-components
SystemCard.Header: FC<{ children?: ReactNode }>;
SystemCard.UptimeBar: FC<UptimeBarProps>;
SystemCard.Details: FC<{ children?: ReactNode }>;
SystemCard.Metrics: FC<{ responseTime?: number; lastChecked?: string }>;
SystemCard.Charts: FC<{ serviceName: string }>;
```

#### 3. `<StatusBadge />` - Status Indicator

```typescript
interface StatusBadgeProps {
  status: 'up' | 'degraded' | 'down' | 'maintenance';
  /** Customizable labels (i18n support) */
  labels?: {
    up?: string;          // default: "Operational"
    degraded?: string;    // default: "Degraded"
    down?: string;        // default: "Major Outage"
    maintenance?: string; // default: "Maintenance"
  };
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}
```

#### 4. `<SystemCardGroup />` - Optional Grouping (Council Recommendation)

```typescript
interface SystemCardGroupProps {
  /** Group identifier */
  name: string;
  /** Display name */
  displayName: string;
  /** Services in this group */
  services: string[];
  /** Initially collapsed (default: false) */
  defaultCollapsed?: boolean;
  /** Group status derived from children (worst-of) */
  status?: 'up' | 'degraded' | 'down' | 'maintenance';
}
```

### Data Schema (Council Feedback: Required)

#### `daily-summary.json` Schema

```typescript
interface DailySummary {
  schemaVersion: 1;
  generatedAt: string;        // ISO 8601 timestamp (UTC)
  windowDays: number;         // e.g., 90
  services: {
    [serviceName: string]: DayEntry[];
  };
}

interface DayEntry {
  date: string;               // ISO 8601 date (UTC): "2025-01-15"
  uptimePercent: number;      // 0-100
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  checksTotal: number;
  checksPassed: number;
  incidentCount: number;
  observedMinutes: number;    // For partial day handling
}
```

#### `current.json` Schema

```typescript
interface CurrentStatus {
  schemaVersion: 1;
  generatedAt: string;        // ISO 8601 timestamp (UTC)
  services: {
    [serviceName: string]: {
      status: 'up' | 'degraded' | 'down' | 'maintenance';
      lastCheck: string;
      todayUptimePercent: number;
      todayChecks: number;
      todayObservedMinutes: number;
    };
  };
}
```

### Accessibility Requirements (Council Feedback: Critical)

#### Color Independence
- Bars must have `aria-label` with full status text
- Consider pattern fills for colorblind users (hatching for degraded, dots for outage)
- Status badge includes icon alongside color

#### Keyboard Navigation
- Arrow keys navigate between days in UptimeBar
- Enter/Space to expand card
- Escape to collapse
- Tab order: card → expand button → uptime bar → details

#### Screen Reader Support
```html
<!-- UptimeBar aria-label example -->
<div
  role="img"
  aria-label="90-day uptime for Claude API: 99.7%. 87 days operational, 2 days degraded, 1 day with outage."
>
  <!-- Individual day on focus -->
  <div
    role="button"
    tabindex="0"
    aria-label="January 15: 99.8% uptime, no incidents"
  />
</div>
```

#### Reduced Motion
- Respect `prefers-reduced-motion` for expand/collapse
- Use opacity fade instead of height animation when enabled

### Mobile Responsiveness (Council Feedback: Required)

| Viewport | Days Shown | Behavior |
|----------|------------|----------|
| < 600px | 30 days | Tap to expand |
| 600-1024px | 60 days | Tap to expand |
| > 1024px | 90 days | Click to expand |

- Minimum touch target: 44x44px for expand button
- Bars use `flex-grow` with minimum width
- Long press shows day tooltip on touch devices
- **Tap to expand** (not swipe - conflicts with scroll)

### Error & Loading States (Council Feedback: Required)

```typescript
// Loading state
<UptimeBar loading>
  <Skeleton height={34} /> {/* Shimmer effect */}
</UptimeBar>

// Error state
<UptimeBar error={new Error("Failed to load")}>
  <ErrorMessage onRetry={refetch}>
    Failed to load uptime data
  </ErrorMessage>
</UptimeBar>

// No data state
<UptimeBar data={[]}>
  <EmptyState>
    No monitoring data available
  </EmptyState>
</UptimeBar>
```

### Merge Strategy Edge Cases (Council Feedback)

| Scenario | Behavior |
|----------|----------|
| `daily-summary.json` stale (>24h) | Show warning badge, use cached data |
| `current.json` fails to load | Fall back to daily-summary only, show "as of X" |
| Timezone mismatch | Normalize all to UTC, document requirement |
| Service in one file but not other | Use available data, gray for missing |
| Partial day (< 60 min observed) | Show as "no-data" gray |

### Caching Strategy

```typescript
const CACHE_CONFIG = {
  'daily-summary.json': {
    maxAge: 3600,              // 1 hour
    staleWhileRevalidate: true,
  },
  'current.json': {
    maxAge: 60,                // 1 minute
    staleWhileRevalidate: true,
  },
};
```

### Configuration Options

```typescript
interface StatusPageOptions {
  // ... existing options ...

  /**
   * Card layout style
   * - 'minimal': Claude/OpenRouter style (default)
   * - 'detailed': Original detailed cards
   */
  statusCardLayout?: 'minimal' | 'detailed';

  /**
   * Number of days in uptime bar (responsive defaults)
   * Requires daily-summary.json for >14 days
   */
  uptimeBarDays?: number;

  /**
   * Show expand button on cards
   */
  expandableCards?: boolean; // default: true

  /**
   * Default view mode
   * - 'minimal': All cards collapsed
   * - 'expanded': All cards expanded
   * - 'auto': Expand if active incident
   */
  defaultView?: 'minimal' | 'expanded' | 'auto';

  /**
   * Service grouping configuration
   */
  groups?: {
    name: string;
    displayName: string;
    services: string[];
    defaultCollapsed?: boolean;
  }[];

  /**
   * Uptime thresholds for color coding
   */
  thresholds?: {
    operational: number; // default: 99
    degraded: number;    // default: 95
  };
}
```

### Theming / CSS Variables

```css
:root {
  /* Status colors */
  --status-operational: #22C55E;
  --status-degraded: #EAB308;
  --status-outage: #EF4444;
  --status-maintenance: #3B82F6;
  --status-no-data: #9CA3AF;

  /* Dark mode overrides */
  --status-operational-dark: #16A34A;
  --status-degraded-dark: #CA8A04;
  --status-outage-dark: #DC2626;

  /* Spacing */
  --status-bar-height: 34px;
  --status-bar-gap: 2px;
  --status-bar-radius: 2px;

  /* Animation */
  --status-expand-duration: 150ms;
  --status-expand-timing: ease-out;
}
```

### Migration Path

#### Phase 1: New Components (Non-Breaking)
- Create `UptimeBar`, `StatusBadge`, `SystemCard` components
- Create `StatusDataProvider` context
- Export from `@theme/StatusComponents`
- Add to swizzle list
- Add visual regression tests (Chromatic/Percy)
- Add accessibility audit (axe-core)
- **Effort**: 10-14 hours

#### Phase 2: ADR-002 Completion
- Implement `daily-summary.json` generation (ADR-002 Phase 2)
- Implement hybrid read in `useDailySummary` hook (ADR-002 Phase 3)
- Enable 90-day UptimeBar
- **Effort**: 6-8 hours (per ADR-002)

#### Phase 3: Default Layout Switch
- Update `StatusPage` to use minimal cards by default
- Add `statusCardLayout` option for backwards compatibility
- Deprecation notice for old layout
- Add E2E tests for expand/collapse
- Mobile viewport testing
- **Effort**: 6-8 hours

#### Phase 4: Documentation & Migration
- Update README with new component examples
- Add composable components guide
- Migration guide for existing users
- Codemod for deprecated props (optional)
- **Effort**: 3-4 hours

### Rollback Strategy (Council Feedback)

**Phase 1-2 (additive)**: No rollback needed—new components coexist with old.

**Phase 3 (breaking)**:
- Feature flag: `statusPage.layout: 'legacy' | 'minimal'`
- Config option preserved for 2 minor versions
- Deprecation warning in console if 'legacy' used

**If critical issues found**:
- Revert default in patch release
- Document known issues
- Hotfix timeline: <48 hours

### Testing Requirements (Council Feedback)

**Phase 1**:
- [ ] Visual regression tests for UptimeBar (Chromatic/Percy)
- [ ] Unit tests for day color thresholds
- [ ] Accessibility audit (axe-core)
- [ ] Unit tests for data merge logic

**Phase 3**:
- [ ] E2E tests for expand/collapse
- [ ] Mobile viewport testing (320px, 768px, 1024px)
- [ ] Performance budget verification
- [ ] Contract tests for JSON schemas

### Performance Budget

```typescript
const PERFORMANCE_BUDGET = {
  // Initial render
  timeToVisuallyComplete: 500,   // ms
  largestContentfulPaint: 1000,  // ms

  // Bundle size impact
  uptimeBarComponent: 3,         // KB gzipped
  systemCardComponent: 2,        // KB gzipped
  statusDataProvider: 2,         // KB gzipped
  totalPluginOverhead: 10,       // KB gzipped

  // Runtime
  expandCollapseAnimation: 16,   // ms (60fps)
  tooltipAppear: 100,            // ms
};
```

## Consequences

### Positive

- **Faster scanning**: Users assess all systems in <1 second
- **Industry alignment**: Matches Claude, OpenRouter, GitHub status pages
- **90-day visibility**: Full 3-month trend at a glance
- **Composable**: Components reusable in custom pages
- **Progressive disclosure**: Details on demand, not by default
- **Smaller initial DOM**: Minimal cards render less content
- **Accessible**: Keyboard navigable, screen reader friendly

### Negative

- **Breaking change**: Current users may need to adapt (mitigated by config option)
- **ADR-002 dependency**: 90-day view requires daily-summary.json
- **Additional components**: More code to maintain
- **Learning curve**: New component API for customizers

### Neutral

- **Detailed view preserved**: Still accessible via expand
- **Configuration option**: Can revert to detailed layout
- **Backward compatible export**: Old components still work during transition

## Council Feedback Incorporated

| Feedback | Resolution |
|----------|------------|
| Separate data fetching from rendering | Added StatusDataProvider context |
| Use compound component pattern | SystemCard uses slots pattern |
| Add accessibility requirements | Full a11y section with ARIA, keyboard, screen reader |
| Mobile responsiveness | 30/60/90 day responsive breakpoints |
| Error/loading states | Added to component props |
| Schema versioning | Added schemaVersion to both JSON schemas |
| Timezone handling | Explicit UTC requirement |
| Grouping support | Added SystemCardGroup component |
| Tooltip implementation | Radix UI popover (not HTML title) |
| Animation preferences | 150ms ease-out, respects reduced-motion |
| Rollback strategy | Added with timeline |
| Testing requirements | Added per-phase checklist |

## References

- ADR-001: Configurable Data Fetching Strategies
- ADR-002: Historical Data Aggregation for Status Page Charts
- https://status.claude.com - Anthropic's status page
- https://status.openrouter.ai - OpenRouter's status page
- https://www.atlassian.com/software/statuspage - Industry standard patterns
- LLM Council review: 2026-01-05 (GPT-5.2, Gemini-3-Pro, Grok-4.1, Claude Opus 4.5)
