# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

API Key Manager is a secure Windows desktop application for managing API keys, built with Wails (Go + WebView2). It uses AES-256-GCM encryption to store API keys locally with SHA-256 checksum verification.

**Current Version**: V1.0.3 (V1.1 feature: tag library system)

## Commands

### Development
```bash
# Install frontend dependencies
cd frontend && npm install

# Run in development mode (hot reload)
wails dev

# Clean build (removes build artifacts)
wails build -clean
```

### Build
```bash
# Standard build
wails build

# Build with trimpath for smaller binary
wails build -trimpath
```

## Architecture

### Backend (Go + Wails)

| File | Responsibility |
|------|----------------|
| `main.go` | Wails app entry, window configuration |
| `app.go` | App struct, binds methods to frontend via Wails |
| `internal/services/keyservice.go` | API Key CRUD, search (uses TagIds), import/export |
| `internal/services/tagservice.go` | Tag library CRUD operations |
| `internal/storage/storage.go` | File I/O, atomic writes, SHA-256 verification, V1.0→V1.1 migration |
| `internal/crypto/crypto.go` | AES-256-GCM encryption/decryption |
| `internal/models/models.go` | Data structures, error codes, default tags |

### Frontend (Vanilla JS + Vite)

The frontend uses vanilla JavaScript with glassmorphism styling. Module structure:
- `frontend/src/main.js` - Core UI logic, state management (AppState), loadData, renderKeys/renderTags
- `frontend/src/tags.js` - Tag management module, TagManager with caching, tag CRUD modals
- `frontend/src/import-export.js` - Import/export, conflict resolution dialog
- `frontend/src/theme.js` - Theme toggle (light/dark mode)
- `frontend/styles/` - CSS files (glass.css, components.css, animations.css)

### V1.1 Data Model Changes

**V1.0 → V1.1 Migration**: Tags moved from inline string arrays to a separate Tag library

| Aspect | V1.0 | V1.1 |
|--------|------|------|
| Tag Storage | `item.Tags: []string` | `item.TagIds: []string` + `data.Tags: []Tag` |
| Tag Selection | Free text input | Dropdown from tag library |
| Search Logic | Direct string match | TagId → Tag lookup via tagMap |

**Data Schema (V1.1)**:
```typescript
interface APIKeyRecord {
  id: string;
  website: string;
  key: EncryptedData;
  tagIds: string[];      // V1.1: References to Tag.id
  tags: string[];        // V1.0 compat (deprecated, used in migration only)
  note: string;
  createdAt: number;
  updatedAt: number;
}

interface Tag {
  id: string;
  name: string;          // Unique, case-insensitive
  color: string;         // HEX format (#RRGGBB)
  createdAt: number;
}

interface DataFile {
  version: "1.1";
  items: APIKeyRecord[];
  tags: Tag[];           // V1.1: Tag library
}
```

### Critical: SearchKeys Implementation

The `SearchKeys` function in `keyservice.go` is a common source of bugs. It must:

1. **Build a tagMap** from `data.Tags` before iterating items
2. **Use item.TagIds** (not item.Tags) for filtering and searching
3. **Map TagIds to Tag names** for keyword search

```go
// Correct pattern for SearchKeys
func (s *KeyService) SearchKeys(query string, selectedTag string) ([]models.APIKeyRecord, error) {
    data, err := s.storage.ReadData()
    // ...

    // STEP 1: Build tagMap for TagId → Tag lookup
    tagMap := make(map[string]models.Tag)
    for _, tag := range data.Tags {
        tagMap[tag.ID] = tag
    }

    for _, item := range data.Items {
        // STEP 2: Filter by TagId (not tag name)
        if selectedTag != "" && selectedTag != "all" {
            tagMatched := false
            for _, tagId := range item.TagIds {
                if tagId == selectedTag {
                    tagMatched = true
                    break
                }
            }
            if !tagMatched {
                continue
            }
        }

        // STEP 3: Search uses tagMap to find Tag names
        if query != "" {
            tagMatch := false
            for _, tagId := range item.TagIds {
                if tag, ok := tagMap[tagId]; ok {
                    if strings.Contains(strings.ToLower(tag.Name), query) {
                        tagMatch = true
                        break
                    }
                }
            }
            // ... also search website, note
        }
    }
}
```

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   app.go    │────▶│  KeyService │────▶│   Storage   │
│ (main.js)   │     │  (bindings) │     │  /TagService│     │  (data dir) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                                      │
       │    ┌─────────────────────────────────┘
       │    │
       ▼    ▼
┌─────────────────────────────────────────────────────────┐
│                    Module Interaction                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  loadData() ─────▶ GetAllTags() ─────▶ AppState.tags    │
│       │                                                  │
│       ├──▶ LoadKeys() ─────────▶ AppState.keys          │
│       │                                                  │
│       └──▶ renderTags() ◀── uses AppState.tags          │
│       │                                                  │
│       └──▶ renderKeys() ◀── uses AppState.colors        │
│                          (tagId→Tag mapping)             │
│                                                          │
│  Tag Management                                          │
│  openTagManagementModal() ──▶ TagManager.getAllTags()   │
│                          ──▶ CreateTag/UpdateTag/Delete │
│                          ──▶ window.loadData() ◄──── refresh │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Storage Structure

```
data/
├── data.json        # Main data file (items + tags library)
├── data.sha256      # Checksum for data.json
├── master.key       # AES-256 master key (32 bytes)
├── master.sha256   # Checksum for master.key
├── export/         # Export directory
│   └── export-*.zip
└── backup/         # Auto-backup before import
    └── backup-*/
```

### Import/Export

- **Export**: Creates `.zip` with `data.json`, `master.key`, `manifest.json`
- **Import**: Two-phase - `ImportData()` detects conflicts, `ImportWithResolution()` merges
- **Conflict Resolution**: Three options - keep existing, use imported, keep both (adds "-导入" suffix)
- **Auto-backup**: Creates timestamped backup before import (excludes `backup/` and `export/` directories to prevent infinite recursion)
- **File Dialog**: Always use `runtime.OpenFileDialog` from Go backend - HTML File API doesn't work reliably in WebView2

## Key Implementation Details

### Frontend Global Exports

These functions are exposed via `window` for inter-module communication:
```javascript
window.showToast = showToast;      // Toast notifications
window.loadData = loadData;        // Main data refresh (call after tag changes)
```

### Tag Service Caching

`TagManager` in `tags.js` has 5-second cache. Call `clearCache()` after mutations:
```javascript
async createTag(name, color) {
    const tag = await CreateTag(name, color);
    this.clearCache();  // Invalidate cache
    return tag;
}
```

### Wails Runtime Dialogs

For native file dialogs in WebView2, always use Go backend with `runtime.OpenFileDialog`:

```go
import "github.com/wailsapp/wails/v2/pkg/runtime"

func (a *App) OpenFileDialog() (string, error) {
    return runtime.OpenFileDialog(a.ctx, runtime.OpenFileDialogOptions{
        Title: "Select File",
        Filters: []runtime.FileFilter{
            {DisplayName: "ZIP Files (*.zip)", Pattern: "*.zip"},
        },
    })
}
```

HTML `<input type="file">` doesn't provide reliable file paths in WebView2.

### Color Contrast

Use `getContrastColor(hexColor)` to determine black/white text based on background:
```javascript
// Brightness formula: (R*299 + G*587 + B*114) / 1000
// Returns '#000000' for bright backgrounds, '#ffffff' for dark
```

### Default Tags (8 Presets)

| Name | Color | Icon |
|------|-------|------|
| AI | #667eea | ph-brain |
| MCP | #f093fb | ph-plugs |
| 支付 | #10b981 | ph-credit-card |
| 邮箱 | #f59e0b | ph-envelope |
| 代码 | #3b82f6 | ph-code |
| 云服务 | #06b6d4 | ph-cloud |
| 社交 | #ec4899 | ph-users |
| 其他 | #6b7280 | ph-tag |

## Common Pitfalls

1. **Using `item.Tags` instead of `item.TagIds`** - Always use TagIds in V1.1 code
2. **Not calling `window.loadData()` after tag mutations** - UI won't refresh
3. **Forgetting to build tagMap in SearchKeys** - Tag lookups will fail
4. **Missing `clearCache()` in TagManager** - Stale data will be returned
5. **Not handling V1.0→V1.1 migration** - Old data won't load correctly
6. **Deadlock with mutex in ImportWithResolution** - Never call `ImportData` from within `ImportWithResolution` (or any method that holds `s.mu` lock) - use `runtime.OpenFileDialog` for native file dialogs instead of HTML File API

## Error Handling

Custom error codes in `internal/models/models.go`:
- `ErrTagAlreadyExists` - Tag name must be unique (case-insensitive)
- `ErrTagNotFound` - Referenced non-existent tag ID
- `ErrChecksumFailed` - Data corruption detected
- `ErrMasterKeyMissing` - Cannot decrypt without master key
