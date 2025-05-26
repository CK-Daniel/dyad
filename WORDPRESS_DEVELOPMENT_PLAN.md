# WordPress Development Plan for Dyad

## Overview

This plan outlines the adaptation of Dyad to support WordPress development while maintaining 100% compatibility with the existing codebase architecture. We'll leverage Dyad's current infrastructure for process management, file operations, AI integration, and preview systems.

## Core Principles

1. **Minimal Changes**: Reuse existing Dyad infrastructure wherever possible
2. **Native Binaries**: Bundle PHP/MySQL for unlimited site capacity
3. **Maintain Architecture**: Keep the same IPC, state management, and UI patterns
4. **Backwards Compatible**: Existing React apps continue to work

## Architecture Integration

### 1. Binary Management

#### Location
```
extraResources/
└── wordpress-runtime/
    ├── darwin-x64/
    │   ├── php/
    │   └── mysql/
    ├── darwin-arm64/
    │   ├── php/
    │   └── mysql/
    ├── win32-x64/
    │   ├── php/
    │   └── mysql/
    └── linux-x64/
        ├── php/
        └── mysql/
```

#### Integration with Existing Code
- Store in `extraResources` (already used by Electron Forge)
- Access via `app.getAppPath()` pattern (consistent with current approach)
- Use existing `process_manager.ts` infrastructure

### 2. Database Schema Updates

Add to `src/db/schema.ts`:
```typescript
// Update apps table - note: using SQLite, not PostgreSQL
export const apps = sqliteTable('apps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  path: text('path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })...,
  updatedAt: integer('updated_at', { mode: 'timestamp' })...,
  githubOrg: text('github_org'),
  githubRepo: text('github_repo'),
  supabaseProjectId: text('supabase_project_id'),
  // NEW FIELDS:
  appType: text('app_type', { enum: ['react', 'wordpress'] }).default('react'),
  mysqlPort: integer('mysql_port'),
  phpPort: integer('php_port'),
});
```

### 3. IPC Handler Extensions

Create new handler following existing patterns:
```typescript
// src/ipc/handlers/wordpress_handlers.ts
import { SafeHandle } from './safe_handle';
import { WordPressRuntime } from '../utils/wordpress_runtime';

export const wordpressHandlers = {
  'wordpress:start': SafeHandle(async (_, appId: string) => {
    // Reuse existing app lookup logic
    const app = await getAppById(appId);
    if (!app) throw new Error('App not found');
    
    // Use existing process manager patterns
    const runtime = new WordPressRuntime();
    const { phpPort, mysqlPort } = await runtime.start(app.path);
    
    // Update app record
    await updateApp(appId, { phpPort, mysqlPort });
    
    return { phpPort, mysqlPort };
  }),
  
  'wordpress:stop': SafeHandle(async (_, appId: string) => {
    // Follows existing stop patterns
  }),
};
```

### 4. Process Management Integration

Extend `src/ipc/utils/process_manager.ts`:
```typescript
// Add WordPress-specific process tracking
const wordpressProcesses = new Map<string, WordPressProcess>();

interface WordPressProcess {
  mysql: ChildProcess;
  php: ChildProcess;
  mysqlPort: number;
  phpPort: number;
}

// Integrate with existing runApp logic
export async function runApp(appId: string, appPath: string, appType: string) {
  if (appType === 'wordpress') {
    return runWordPressApp(appId, appPath);
  }
  // Existing React app logic
  return runReactApp(appId, appPath);
}
```

### 5. Scaffold Integration

Modify scaffold structure:
```
scaffold/           # Keep existing React scaffold as default
├── package.json
├── index.html
├── components/
├── src/
└── ...

scaffold-wordpress/  # New WordPress scaffold directory
├── wordpress/       # Core WordPress files
├── wp-config.php
├── AI_RULES.md
├── .gitignore
└── README.md
```

**Note**: The existing scaffold is a complete React/Vite app with shadcn/ui components. We'll create a separate scaffold-wordpress directory to avoid disrupting existing functionality.

### 6. UI Component Updates

#### App Import Flow Updates
Extend `src/components/ImportAppDialog.tsx` and `src/ipc/handlers/import_handlers.ts`:

1. **Import Dialog Changes**:
```typescript
// Add WordPress project detection
const detectProjectType = async (projectPath: string) => {
  const hasWpConfig = await fs.access(path.join(projectPath, 'wp-config.php'))
    .then(() => true).catch(() => false);
  const hasWpContent = await fs.access(path.join(projectPath, 'wp-content'))
    .then(() => true).catch(() => false);
  
  return hasWpConfig || hasWpContent ? 'wordpress' : 'react';
};

// Add app type selection with auto-detection
<Select value={appType} onValueChange={setAppType}>
  <SelectItem value="react">React App</SelectItem>
  <SelectItem value="wordpress">WordPress Site</SelectItem>
</Select>
```

2. **Import Handler Updates**:
```typescript
// In import_handlers.ts, modify import-app handler
// Detect WordPress projects and store appType
const appType = await detectProjectType(sourcePath);

const [app] = await db.insert(apps).values({
  name: appName,
  path: appName,
  appType: appType, // NEW
}).returning();
```

#### Preview Panel
Reuse existing `PreviewPanel.tsx` with WordPress-specific handling:
```typescript
// Detect WordPress admin URLs
const isWordPressAdmin = url.includes('/wp-admin');

// Show WordPress-specific controls
{app.appType === 'wordpress' && (
  <WordPressToolbar />
)}
```

### 7. AI System Integration

#### Prompt Updates
Create `src/prompts/wordpress_system_prompt.ts`:
```typescript
import { DYAD_SYSTEM_PROMPT, THINKING_PROCESS_PROMPT } from './system_prompt';

export const getWordPressSystemPrompt = (app: App) => `
${DYAD_SYSTEM_PROMPT}
${THINKING_PROCESS_PROMPT}

You are developing a WordPress site. The project structure includes:
- WordPress core files in /wordpress/
- Theme files in /wordpress/wp-content/themes/
- Plugin files in /wordpress/wp-content/plugins/
- Configuration in /wp-config.php

Available WordPress-specific operations:
- <dyad-write> - Create/edit PHP, CSS, JS files
- <dyad-wp-cli> - Run WP-CLI commands
- <dyad-wp-db> - Execute MySQL queries
- <dyad-add-dependency> - Install WordPress plugins via composer

Best practices:
- Follow WordPress coding standards
- Use proper escaping and sanitization
- Implement hooks and filters appropriately
- Create child themes when customizing existing themes
`;
```

#### Update Stream Handler
Modify `src/ipc/handlers/chat_stream_handlers.ts` to use WordPress prompt:
```typescript
// In the stream handler, check app type
const systemPrompt = app.appType === 'wordpress' 
  ? getWordPressSystemPrompt(app)
  : DYAD_SYSTEM_PROMPT + THINKING_PROCESS_PROMPT;
```

#### Response Processor
Extend `src/ipc/processors/response_processor.ts`:
```typescript
// Add WordPress-specific processors
const processors = {
  // ... existing processors ...
  'dyad-wp-theme': processWordPressThemeFile,
  'dyad-wp-plugin': processWordPressPluginFile,
  'dyad-wp-cli': processWPCLICommand,
  'dyad-wp-db': processWordPressDB,
};
```

### 8. File Operations

Leverage existing file operation system:
```typescript
// WordPress files go through same write/delete/rename operations
// Just with WordPress-specific paths
const wordpressFileOp = {
  type: 'write',
  path: 'wordpress/wp-content/themes/custom/style.css',
  content: '/* Theme styles */'
};

// Processed by existing executeWrite function
```

### 9. Process Management and Binary Path Resolution

#### Binary Path Management
Create `src/ipc/utils/wordpress_binary_utils.ts`:
```typescript
import { app } from 'electron';
import path from 'path';
import { platform, arch } from 'os';

export function getWordPressBinaryPath(binary: 'php' | 'mysql') {
  const resourcesPath = app.isPackaged 
    ? process.resourcesPath 
    : path.join(__dirname, '../../../');
  
  const platformArch = `${platform()}-${arch()}`;
  const binaryName = platform() === 'win32' ? `${binary}.exe` : binary;
  
  return path.join(
    resourcesPath,
    'extraResources',
    'wordpress-runtime',
    platformArch,
    binary,
    'bin',
    binaryName
  );
}

// Port allocation using existing utilities
import { getAvailablePort } from './port_utils';

export async function allocateWordPressPorts() {
  const phpPort = await getAvailablePort(8080);
  const mysqlPort = await getAvailablePort(3306);
  return { phpPort, mysqlPort };
}
```

## Leveraging Existing Dyad Features

### Reusable Components
1. **Git Integration** - WordPress projects will use same git workflow
2. **GitHub Integration** - Deploy WordPress themes/plugins to GitHub
3. **Supabase Integration** - Can be used as external database for WordPress
4. **Chat History** - Same conversation management for WordPress development
5. **Model Selection** - All AI models work for WordPress development
6. **File Tree** - Existing component handles WordPress directory structure
7. **Monaco Editor** - Already supports PHP syntax highlighting
8. **Preview Panel** - iframe-based preview works for WordPress sites
9. **Token Tracking** - Same usage tracking for WordPress conversations
10. **Error Handling** - Existing error boundaries and recovery mechanisms

### WordPress-Specific Enhancements
1. **WP-CLI Integration** - New processor for WordPress commands
2. **Database Viewer** - Extend SQL execution for WordPress tables
3. **Plugin/Theme Templates** - WordPress-specific scaffolds
4. **PHP Debugging** - Add PHP error parsing to chat interface

## Implementation Phases

### Phase 1: Foundation (Week 1)
1. **Day 1-2**: Set up binary bundling in `forge.config.ts`
   - Add extraResources configuration
   - Create download scripts for PHP/MySQL binaries
   - Test packaging on all platforms

2. **Day 3-4**: Create `wordpress_runtime.ts`
   - Implement binary path resolution
   - Add MySQL/PHP start/stop methods
   - Create health check utilities

3. **Day 5**: Database schema updates
   - Add appType field
   - Run migrations
   - Update TypeScript types

### Phase 2: Core Integration (Week 2)
1. **Day 1-2**: IPC handlers
   - Create `wordpress_handlers.ts`
   - Register in `ipc_host.ts`
   - Add client methods in `ipc_client.ts`

2. **Day 3-4**: Process management
   - Extend `process_manager.ts`
   - Add WordPress process tracking
   - Implement port management

3. **Day 5**: Scaffold creation
   - Create WordPress scaffold structure
   - Update `import_handlers.ts`
   - Test app creation flow

### Phase 3: UI/UX (Week 3)
1. **Day 1-2**: App creation UI
   - Update `ImportAppDialog.tsx`
   - Add app type selection
   - Update creation flow

2. **Day 3-4**: Preview integration
   - Adapt `PreviewPanel.tsx`
   - Handle WordPress URLs
   - Add WordPress-specific controls

3. **Day 5**: File management
   - Update file tree for WordPress structure
   - Add WordPress file icons
   - Handle wp-content operations

### Phase 4: AI Integration (Week 4)
1. **Day 1-2**: System prompts
   - Create WordPress prompts
   - Update `stream_chat_handlers.ts`
   - Add WordPress context

2. **Day 3-4**: Response processors
   - Implement WordPress operations
   - Add WP-CLI support
   - Test AI interactions

3. **Day 5**: Testing & Polish
   - End-to-end testing
   - Performance optimization
   - Documentation updates

## File Changes Summary

### New Files
- `src/ipc/handlers/wordpress_handlers.ts` - WordPress-specific IPC handlers
- `src/ipc/utils/wordpress_runtime.ts` - PHP/MySQL process management
- `src/ipc/utils/wordpress_binary_utils.ts` - Binary path resolution
- `src/prompts/wordpress_system_prompt.ts` - WordPress AI prompts
- `src/components/WordPressToolbar.tsx` - WordPress-specific UI controls
- `scaffold-wordpress/` - WordPress project template
- `drizzle/0006_add_wordpress_support.sql` - Migration for new fields

### Modified Files
- `src/db/schema.ts` - Add appType, mysqlPort, phpPort fields
- `src/ipc/ipc_host.ts` - Register WordPress handlers
- `src/ipc/handlers/import_handlers.ts` - Add WordPress detection
- `src/ipc/handlers/chat_stream_handlers.ts` - Use WordPress prompts
- `src/ipc/utils/process_manager.ts` - Add WordPress process support
- `src/components/ImportAppDialog.tsx` - Add project type selection
- `src/components/PreviewPanel.tsx` - Handle WordPress URLs
- `src/ipc/processors/response_processor.ts` - Add WP-CLI and DB processors
- `forge.config.ts` - Add extraResources for binaries

### Unchanged Systems
- Authentication/Supabase integration
- Git version control
- Chat system and history
- Settings management
- Model/provider system
- Telemetry
- Auto-updates

## Testing Strategy

1. **Unit Tests** (Using Vitest)
   - WordPress runtime methods
   - Binary path resolution
   - WordPress project detection
   - Process management integration

2. **Integration Tests**
   - Full WordPress site creation flow
   - AI-generated theme/plugin code
   - Database operations
   - Preview functionality with WordPress URLs

3. **E2E Tests** (Using Playwright)
   - Complete WordPress development workflow
   - Cross-platform binary execution
   - Import existing WordPress projects
   - Performance with multiple WordPress sites

## Rollout Plan

1. **Alpha**: Internal testing with bundled binaries
2. **Beta**: Limited release to test WordPress features
3. **Stable**: Full release with both React and WordPress support

## Success Metrics

- WordPress sites start in <10 seconds
- Binary size <400MB per platform (based on research: PHP ~100MB + MySQL ~250MB)
- AI can successfully create themes/plugins with proper WordPress patterns
- No regression in React app functionality
- Memory usage scales linearly with number of sites
- Seamless switching between React and WordPress projects
- WordPress project detection accuracy >95%

## Risk Mitigation

1. **Binary Size**: Offer separate downloads for React-only vs WordPress
2. **Compatibility**: Test on minimum OS versions
3. **Performance**: Implement lazy loading of WordPress runtime
4. **Security**: Sandbox MySQL to app-specific ports/directories

## Codebase-Specific Considerations

### Based on Current Architecture Analysis:

1. **IPC Pattern Consistency**
   - Follow the `SafeHandle` wrapper pattern used in all handlers
   - Use existing `createLoggedHandler` for consistent logging
   - Return types should match existing handler patterns

2. **State Management**
   - Extend existing atoms in `src/atoms/appAtoms.ts` for WordPress state
   - Use Jotai atoms for WordPress-specific settings
   - Keep WordPress state separate but following same patterns

3. **UI Component Patterns**
   - Use existing shadcn/ui components from `src/components/ui/`
   - Follow the sheet/dialog patterns for WordPress-specific modals
   - Maintain consistent styling with Tailwind classes

4. **Error Handling**
   - Use existing `ErrorBoundary` component
   - Follow the toast notification pattern for user feedback
   - Implement proper error recovery for PHP/MySQL crashes

5. **Testing Approach**
   - Add WordPress tests to existing test structure
   - Use Vitest for unit tests (already configured)
   - Extend Playwright tests for WordPress E2E scenarios

6. **Migration Strategy**
   - Create Drizzle migration for schema changes
   - Ensure backward compatibility with existing apps
   - Test migration on existing Dyad installations

This plan ensures WordPress support is added as a natural extension of Dyad's existing architecture, maintaining code quality and user experience while adding powerful new capabilities. The implementation leverages Dyad's robust foundation while adding WordPress-specific features in a modular, maintainable way.