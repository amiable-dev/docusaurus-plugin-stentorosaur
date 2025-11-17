# Stentorosaur Architecture Analysis - Document Index

## Start Here

New to this analysis? Start with **ARCHITECTURE-SUMMARY.md** for a high-level overview, then dive into specific documents based on your needs.

## Document Guide

### 1. ARCHITECTURE-SUMMARY.md (5-10 min read)
**Executive summary of the system-centric design**

Best for:
- Quick understanding of design principles
- Key constraints and assumptions
- Recommendations for different use cases
- Code location quick reference

Key sections:
- Core Principle
- What's System-Centric
- Key Hard Constraints
- Extension Points
- Recommendations

### 2. ARCHITECTURE-ANALYSIS.md (15-20 min read)
**Comprehensive technical breakdown**

Best for:
- Understanding design patterns in detail
- Learning how each component contributes to system-centric model
- Understanding data structures and type definitions
- Learning configuration and constraints
- Understanding GitHub integration mechanism

Key sections:
1. System-Centric Design Patterns
2. Label-Based System Mapping
3. Monitoring Data Organization
4. Routing: System-Specific Pages
5. Component Architecture
6. Hard-Coded Assumptions
7. Extension Points
8. Constraints for Alternative Models
9. Specific Code Locations
10. Demo Data Pattern

### 3. ARCHITECTURE-DIAGRAM.txt (10-15 min read)
**Visual representations of architecture**

Best for:
- Understanding data flow visually
- Seeing how configuration flows through system
- Understanding constraint implications
- Learning what would break with alternatives

Key diagrams:
- Configuration → GitHub → Status Calculation flow
- Parallel flows: Monitoring, Routing, File Organization
- Issue → System → UI flow
- Name matching constraints visualization
- Alternative model impact analysis

### 4. CODE-REFERENCE-GUIDE.md (30-45 min read)
**Line-by-line code locations and implementation details**

Best for:
- Finding specific implementation details
- Understanding code at specific line numbers
- Learning exact data transformations
- Following specific workflows
- Implementing changes

Key sections:
- Type Definition Locations table
- Issue-to-System Linking (GitHub Service)
- Monitoring Data Organization
- Routing Implementation
- Component Implementation (StatusBoard, StatusPage, StatusHistory, PerformanceMetrics)
- Demo Data
- File Dependencies
- Critical System Name Matching Points
- Validation Points

## Finding What You Need

### I want to understand...

**The overall design**
→ Start with ARCHITECTURE-SUMMARY.md

**How systems are defined**
→ ARCHITECTURE-ANALYSIS.md, Section 1.2
→ CODE-REFERENCE-GUIDE.md, Configuration section

**How GitHub issues link to systems**
→ ARCHITECTURE-ANALYSIS.md, Section 2
→ CODE-REFERENCE-GUIDE.md, Issue-to-System Linking
→ SOURCE: src/github-service.ts lines 106-108

**How status is calculated**
→ ARCHITECTURE-ANALYSIS.md, Section 2.2
→ CODE-REFERENCE-GUIDE.md, GitHub Service section
→ SOURCE: src/github-service.ts lines 136-178

**How monitoring data is organized**
→ ARCHITECTURE-ANALYSIS.md, Section 3
→ CODE-REFERENCE-GUIDE.md, Monitoring Data Organization
→ SOURCE: src/index.ts lines 77-126, 247-257

**How routes are created**
→ ARCHITECTURE-DIAGRAM.txt, Routing section
→ CODE-REFERENCE-GUIDE.md, Routing Implementation
→ SOURCE: src/index.ts lines 547-562

**How components display data**
→ ARCHITECTURE-ANALYSIS.md, Section 5
→ CODE-REFERENCE-GUIDE.md, Component Layer
→ SOURCE: src/theme/StatusBoard, StatusPage, StatusHistory

**What would need to change for alternative models**
→ ARCHITECTURE-ANALYSIS.md, Sections 7-8
→ ARCHITECTURE-SUMMARY.md, "To Support Alternative Models"

**Specific code locations**
→ CODE-REFERENCE-GUIDE.md, entire document

## Key Concepts Explained

### System
- A named entity representing something being monitored
- Examples: "API Service", "Main Website", "Database"
- Defined via `systemLabels` configuration
- Serves as unique identifier throughout system

### StatusItem
- Data type representing a system and its current status
- Has fields: name, status, metrics
- Array of these forms the dashboard display

### Incident
- A GitHub issue tracked as StatusIncident
- References systems via `affectedSystems: string[]`
- Status affects referenced systems

### Label Matching
- Process of matching GitHub issue labels against `systemLabels`
- Only exact matches are recognized
- Results in `affectedSystems` field of incident

### Status Calculation
- Deriving system status from its incidents
- Only open incidents count
- Severity hierarchy: critical > major/minor > maintenance > up

### System File
- One JSON file per system containing historical data
- Location: `status-data/systems/{system-name}.json`
- Used for performance metrics display

### Route
- URL path for accessing system-specific history
- Pattern: `/status/history/{system-slug}`
- Created dynamically for each system

### Slug
- URL-safe version of system name
- Generated via deterministic algorithm
- Must be consistent across all components

### affectedSystems
- Array field in StatusIncident and ScheduledMaintenance
- Contains system names (strings)
- Links incidents/maintenance to systems they affect

### svc
- Field in monitoring readings (current.json)
- Stands for "service" or "system"
- Must match a system name for data to be grouped

## Architecture Principles

### 1. Systems as First-Class Entities
Systems are the primary organizing principle. Everything else is secondary to systems.

### 2. Name-Based Identification
System names serve as global identifiers used in:
- Configuration (systemLabels)
- GitHub issue labels
- Data file names
- Route parameters
- Map lookups

### 3. Eager Initialization
All systems from systemLabels are always initialized, even if they have no incidents.

### 4. Label-Based Linking
GitHub issues link to systems exclusively through label matching.

### 5. Flat Hierarchy
No support for grouping systems into categories or creating subsystems.

### 6. Per-System Metrics
Each system maintains separate historical data and metrics.

### 7. Current-State Status
Status reflects current state (open incidents) only, not historical state.

## Common Questions

**Q: Where are systems defined?**
A: In plugin configuration via `systemLabels` array (src/options.ts)

**Q: How do GitHub issues affect system status?**
A: Labels matching systemLabels become affectedSystems, used in status calculation (src/github-service.ts)

**Q: How is monitoring data organized?**
A: By `svc` field which must match a system name (src/index.ts)

**Q: How are routes created?**
A: One route per system item, with slug derived from name (src/index.ts contentLoaded)

**Q: Can I add systems dynamically?**
A: No, all systems must be defined upfront in systemLabels

**Q: Can I track things other than systems?**
A: Technically yes with significant refactoring, but not designed for it

**Q: What happens if naming doesn't match?**
A: Data fragments - issue won't link, monitoring won't aggregate, charts won't load

**Q: Can I group systems together?**
A: No, systems are atomic units with flat hierarchy

## Document Statistics

- **ARCHITECTURE-SUMMARY.md**: ~2,000 words
- **ARCHITECTURE-ANALYSIS.md**: ~4,000 words
- **CODE-REFERENCE-GUIDE.md**: ~3,500 words
- **ARCHITECTURE-DIAGRAM.txt**: ~1,000 words + ASCII art
- **Total**: ~10,500 words of analysis

## Source Code Statistics

- **Total lines analyzed**: ~682 lines of key implementation
- **Files examined**: 10 TypeScript/TSX files
- **Types defined**: 5 core types + variants
- **Components analyzed**: 5 major theme components
- **Configuration options**: 20+ options with system-related defaults

## How These Documents Were Created

This analysis was created through:

1. **Type Definition Analysis** - Examined core types in src/types.ts
2. **Configuration Analysis** - Reviewed options.ts and default values
3. **GitHub Service Analysis** - Traced issue-to-incident conversion
4. **Plugin Orchestration Analysis** - Followed loadContent flow
5. **Component Analysis** - Examined theme components and their data dependencies
6. **Data Flow Analysis** - Traced data through all transformations
7. **Code Reference Mapping** - Located all key implementation points

## Using This Analysis

### For Understanding
1. Read ARCHITECTURE-SUMMARY.md for overview
2. Read relevant section(s) of ARCHITECTURE-ANALYSIS.md
3. View relevant diagram(s) in ARCHITECTURE-DIAGRAM.txt
4. Check CODE-REFERENCE-GUIDE.md for specific code locations

### For Implementation
1. Check CODE-REFERENCE-GUIDE.md for exact file:line locations
2. Review ARCHITECTURE-ANALYSIS.md for broader context
3. Examine ARCHITECTURE-DIAGRAM.txt for data flow understanding

### For Refactoring
1. Review Constraints section of ARCHITECTURE-ANALYSIS.md
2. Check Extension Points section of ARCHITECTURE-SUMMARY.md
3. Consider impact analysis in ARCHITECTURE-DIAGRAM.txt
4. Plan changes using CODE-REFERENCE-GUIDE.md as map

## Next Steps

- Read **ARCHITECTURE-SUMMARY.md** to understand the big picture
- Choose a specific aspect from the "Finding What You Need" section
- Dive into the recommended documents and source files
- Use CODE-REFERENCE-GUIDE.md to navigate implementation details

---

Generated: 2025-11-12
Analysis Scope: docusaurus-plugin-stentorosaur v0.5.x
Focus: System-centric architecture patterns and constraints
