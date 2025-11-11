# SLOOP RPC Internals - Reverse Engineering Documentation

This document contains findings from reverse engineering the SonarLint backend (SLOOP) to understand its caching mechanisms and proper RPC API usage.

## Overview

SLOOP (SonarLint Out-Of-Process) is a Java-based analysis engine that runs as a separate process and communicates via JSON-RPC over stdin/stdout. Understanding its internal architecture is crucial for
proper cache invalidation and file system synchronization.

## Architecture

### Key JAR Files

Located in `sonarlint-backend/lib/`:

- **`sonarlint-rpc-impl-10.32.0.82302.jar`** - RPC service implementations
- **`sonarlint-core-10.32.0.82302.jar`** - Core analysis engine
- **`sonarlint-rpc-protocol-10.32.0.82302.jar`** - RPC protocol definitions (DTOs)

### Key Java Classes

#### 1. `AnalysisRpcServiceDelegate`

**Package**: `org.sonarsource.sonarlint.core.rpc.impl`

**Purpose**: RPC service delegate that handles analysis requests from clients.

**Key Method**:

```java
public CompletableFuture<AnalyzeFilesResponse> analyzeFilesAndTrack(AnalyzeFilesAndTrackParams params)
```

This method delegates to `AnalysisService.scheduleAnalysis()`, which is where the caching happens.

#### 2. `AnalysisService`

**Package**: `org.sonarsource.sonarlint.core.analysis`

**Purpose**: Core service that manages analysis scheduling and execution.

**Key Method**:

```java
public CompletableFuture<AnalysisResult> scheduleAnalysis(
    String configurationScopeId,
    UUID analysisId,
    Set<URI> files,
    Map<String, String> extraProperties,
    boolean shouldFetchServerIssues,
    TriggerType triggerType,
    SonarLintCancelMonitor cancelChecker
)
```

**Critical Code**:

```java
AnalysisScheduler scheduler = this.schedulerCache.getOrCreateAnalysisScheduler(configScopeId, trace);
```

The scheduler is retrieved from a **cache** (`AnalysisSchedulerCache`), which maintains persistent analysis state.

#### 3. `AnalysisSchedulerCache`

**Package**: `org.sonarsource.sonarlint.core.analysis`

**Purpose**: Maintains a cache of `AnalysisScheduler` instances per configuration scope.

**Data Structures**:

```java
// One scheduler for standalone mode
private final AtomicReference<AnalysisScheduler> standaloneScheduler = new AtomicReference();

// Multiple schedulers for connected mode (one per connection)
private final Map<String, AnalysisScheduler> connectedSchedulerByConnectionId = new ConcurrentHashMap<String, AnalysisScheduler>();
```

**Key Methods**:

- `getOrCreateAnalysisScheduler(String configurationScopeId)` - Returns cached scheduler
- `reset(String connectionId, LoadedPlugins newPlugins)` - Resets scheduler state
- `stop(String connectionId)` - Stops and removes scheduler from cache

**Important**: Each scheduler maintains its own analysis state and caching. Simply re-analyzing a file doesn't invalidate cached results unless SLOOP is notified of file system changes.

#### 4. `FileRpcServiceDelegate`

**Package**: `org.sonarsource.sonarlint.core.rpc.impl`

**Purpose**: RPC service delegate that handles file system notifications.

**Key Methods**:

```java
public void didUpdateFileSystem(DidUpdateFileSystemParams params)
public void didOpenFile(DidOpenFileParams params)
public void didCloseFile(DidCloseFileParams params)
```

**Critical Discovery**: The `didUpdateFileSystem` method is the **proper way to invalidate file-level cache** in SLOOP.

## Cache Invalidation Mechanisms

### ❌ What DOESN'T Work

#### 1. LSP Document Lifecycle Notifications

We initially tried using standard LSP notifications:

- `textDocument/didOpen`
- `textDocument/didChange`
- `textDocument/didSave`
- `textDocument/didClose`

**Result**: SLOOP ignores these for cache invalidation purposes. The cache persists across LSP notifications.

**Why it doesn't work**: SLOOP's caching is implemented at the scheduler level, not at the LSP protocol level. LSP notifications are designed for editor synchronization, not cache invalidation.

#### 2. Scope Deletion

We tried deleting scopes from our internal `scopeMap`:

```typescript
scopeMap.delete(projectRoot);
```

**Result**: Doesn't work because SLOOP maintains its own scope-to-scheduler mapping internally. Deleting from our map doesn't affect SLOOP's cache.

### ✅ What DOES Work - VERIFIED WORKING IMPLEMENTATION

#### The Correct Approach: `file/didOpenFile` + `file/didUpdateFileSystem`

**Status**: ✅ Verified working with test results showing cache invalidation (7 issues → 6 issues after quick fix)

**Critical Requirements** (discovered through reverse engineering and testing):

1. **Must call `file/didOpenFile` first** - Registers file in `OpenFilesRepository`
2. **Must provide `content` field** - Triggers `isDirty=true` flag in `ClientFile`
3. **Must set `isUserDefined: true`** - Controls whether file is analyzed (CRITICAL!)
4. **Must provide both `fsPath` AND `content`** - fsPath for context, content for dirty flag
5. **Must wait after notification** - Give SLOOP time to process (500ms recommended)

**RPC Methods**:

1. `file/didOpenFile` - Marks file as open
2. `file/didUpdateFileSystem` - Updates file content and invalidates cache

**Parameters**: `DidUpdateFileSystemParams`

```java
public class DidUpdateFileSystemParams {
    private final List<ClientFileDto> addedFiles;
    private final List<ClientFileDto> changedFiles;
    private final List<URI> removedFiles;
}
```

**ClientFileDto Structure** (CORRECTED based on reverse engineering):

```java
public class ClientFileDto {
    private final URI uri;                    // file:///absolute/path/to/file.js
    private final Path ideRelativePath;       // relative/path/from/root
    private final String configScopeId;       // scope ID from getOrCreateScope()
    private final Boolean isTest;             // null or true/false
    private final String charset;             // "UTF-8"
    private final Path fsPath;                // absolute path - MUST PROVIDE for analyzer context
    private final String content;             // actual file content - MUST PROVIDE to trigger dirty flag
    private final Language detectedLanguage;  // "JS", "TS", "PYTHON", etc.
    private final boolean isUserDefined;      // MUST BE TRUE for SLOOP to analyze!
}
```

### Working Implementation (VERIFIED)

```typescript
async function notifyFileSystemChanged(filePath: string, configScopeId: string): Promise<void> {
  const uri = `file://${filePath}`;

  // Get project root from scopeMap for proper relative path calculation
  let projectRoot: string | undefined;
  for (const [root, scopeId] of scopeMap.entries()) {
    if (scopeId === configScopeId) {
      projectRoot = root;
      break;
    }
  }
  if (!projectRoot) {
    projectRoot = dirname(filePath);
  }

  const relativePath = relative(projectRoot, filePath);
  const bridge = await ensureSloopBridge();
  const language = detectLanguage(filePath);
  const languageEnum = languageToEnum(language); // Maps 'javascript' -> 'JS'

  // STEP 1: Mark file as open (registers in OpenFilesRepository)
  // Without this, SLOOP ignores file system updates for closed files
  bridge.sendNotification('file/didOpenFile', {
    configurationScopeId: configScopeId,
    fileUri: uri
  });

  // STEP 2: Read file content and build ClientFileDto
  const fileContent = readFileSync(filePath, 'utf-8');

  const clientFileDto = {
    uri,
    ideRelativePath: relativePath,
    configScopeId,
    isTest: null,
    charset: 'UTF-8',
    fsPath: filePath,           // Provide fsPath for analyzer context
    content: fileContent,        // Provide content to trigger isDirty=true
    detectedLanguage: languageEnum,
    isUserDefined: true          // CRITICAL: Must be true for analysis!
  };

  // STEP 3: Send file system update notification
  bridge.sendNotification('file/didUpdateFileSystem', {
    addedFiles: [],
    changedFiles: [clientFileDto],
    removedFiles: []
  });

  // STEP 4: Wait for SLOOP to process (critical for cache invalidation)
  await new Promise(resolve => setTimeout(resolve, 500));
}
```

**How It Works** (from decompiled Java):

1. `fromDto(clientFileDto)` creates new `ClientFile` object
2. If `content != null`, calls `file.setDirty(content)` which sets `isDirty=true`
3. When `isDirty=true`, `file.getContent()` returns provided content (not from disk)
4. Updates `filesByUri` and `filesByConfigScopeIdCache` registries
5. Fires `FileSystemUpdatedEvent` which triggers automatic re-analysis for open files

**When to Call**:

- After applying quick fixes that modify files
- After any external file modification that SLOOP should know about
- When files are added, modified, or deleted in the project

**Test Results** (Verified Working):

```
Before: 7 issues (including S3626 "redundant return" on line 12)
After quick fix applied: 6 issues (S3626 removed, line numbers adjusted)
File correctly modified: return statement removed from line 12
```

## RPC Protocol Summary

### Analysis Methods

#### `analysis/analyzeFilesAndTrack`

Analyzes files and tracks issues.

**Params**: `AnalyzeFilesAndTrackParams`

- `configurationScopeId`: string
- `analysisId`: UUID
- `filesToAnalyze`: Set<URI>
- `extraProperties`: Map<string, string>
- `shouldFetchServerIssues`: boolean

**Returns**: `AnalyzeFilesResponse`

- `failedAnalysisFiles`: List<URI>
- `rawIssues`: List<RawIssueDto>

### File System Methods

#### `file/didUpdateFileSystem` (Notification)

**Purpose**: Notify SLOOP of file system changes to invalidate cache.

**Params**: `DidUpdateFileSystemParams`

- `addedFiles`: List<ClientFileDto>
- `changedFiles`: List<ClientFileDto>
- `removedFiles`: List<URI>

**Returns**: void (notification, no response)

#### `file/didOpenFile` (Notification)

**Purpose**: Notify SLOOP that a file was opened in the IDE.

**Params**: `DidOpenFileParams`

- `configurationScopeId`: string
- `fileUri`: URI

#### `file/didCloseFile` (Notification)

**Purpose**: Notify SLOOP that a file was closed in the IDE.

**Params**: `DidCloseFileParams`

- `configurationScopeId`: string
- `fileUri`: URI

### Configuration Scope Methods

#### `config/didAddConfigurationScopes` (Notification)

Creates new configuration scopes.

**Params**: `DidAddConfigurationScopesParams`

- `addedScopes`: List<ConfigurationScopeDto>

#### `config/didRemoveConfigurationScope` (Notification)

Removes a configuration scope (and clears associated cache).

**Params**: `DidRemoveConfigurationScopeParams`

- `removedId`: string

## Best Practices (UPDATED with verified findings)

### 1. Always Notify on File Changes

After modifying any file (especially via quick fixes):

1. Call `file/didOpenFile` to register the file as open
2. Call `file/didUpdateFileSystem` with the modified file in `changedFiles`
3. **CRITICAL**: Set `isUserDefined: true` in ClientFileDto
4. **CRITICAL**: Provide both `fsPath` AND `content` fields
5. Wait 500ms for SLOOP to process before next analysis

### 2. Use Proper Scope Management

- Create scopes with unique IDs per project root
- Use the same scope ID consistently for files in the same project
- Clean up scopes when projects are closed

### 3. Always Provide Content for Updates

When notifying file changes, **provide actual file content** in `ClientFileDto.content` field. This triggers the `isDirty=true` flag, which tells SLOOP to use your provided content instead of reading
from disk. Never set `content: null` when updating files after modifications.

```typescript
// CORRECT - provides content
const clientFileDto = {
  content: readFileSync(filePath, 'utf-8'),  // Actual content
  fsPath: filePath,                          // Path for context
  isUserDefined: true                        // MUST be true!
};

// WRONG - null content means SLOOP reads from disk (may be stale)
const clientFileDto = {
  content: null,  // ❌ Don't do this for updates!
  fsPath: filePath
};
```

### 4. Use Correct Language IDs

Language IDs must be uppercase enum values: `"JS"`, `"TS"`, `"PYTHON"`, `"JAVA"`, etc.
These correspond to the `org.sonarsource.sonarlint.core.rpc.protocol.common.Language` enum.

Map common language names:

```typescript
'javascript' → 'JS'
'typescript' → 'TS'
'python' → 'PYTHON'
'java' → 'JAVA'
```

### 5. File URI Format

Always use `file://` URIs with absolute paths: `file:///absolute/path/to/file.js`

### 6. The isUserDefined Flag is Critical

From reverse engineering, we discovered that `isUserDefined` controls whether SLOOP includes the file in analysis:

- `isUserDefined: true` → File is analyzed
- `isUserDefined: false` → File is IGNORED (results in 0 issues)

This flag MUST be `true` for any file you want analyzed. Setting it to `false` will cause SLOOP to skip the file entirely, even if it has issues.

## Debugging Tips

### 1. Decompile JAR Files

Use CFR (https://github.com/leibnitz27/cfr) to decompile SLOOP classes:

```bash
curl -L https://github.com/leibnitz27/cfr/releases/latest/download/cfr-0.152.jar -o cfr.jar
java -jar cfr.jar /path/to/class/file.class
```

### 2. Monitor RPC Traffic

Add logging to `SloopBridge.sendNotification()` and `SloopBridge.call()` to see all RPC messages:

```typescript
console.error(`[RPC OUT] ${method}:`, JSON.stringify(params, null, 2));
```

### 3. Check Scheduler State

SLOOP maintains scheduler state in:

- `AnalysisSchedulerCache.standaloneScheduler` (standalone mode)
- `AnalysisSchedulerCache.connectedSchedulerByConnectionId` (connected mode)

Restarting SLOOP clears all scheduler caches.

## Lessons Learned

1. **LSP is not enough**: SLOOP implements custom RPC methods beyond standard LSP. Don't assume LSP notifications will handle everything.

2. **Cache is aggressive**: SLOOP aggressively caches analysis results per scheduler. You must explicitly notify file changes.

3. **Reverse engineering is necessary**: Official documentation doesn't cover internal caching mechanisms. Source code analysis was required to find the solution.

4. **Scope-based architecture**: Everything in SLOOP is organized by configuration scopes. Understanding scope management is critical.

5. **Protocol DTOs matter**: The exact structure of DTOs (like `ClientFileDto`) matters. Missing fields or incorrect types can cause silent failures.

## References

- SLOOP Backend: `sonarlint-backend/` directory
- Protocol Definitions: `sonarlint-rpc-protocol-10.32.0.82302.jar`
- RPC Implementations: `sonarlint-rpc-impl-10.32.0.82302.jar`
- Core Engine: `sonarlint-core-10.32.0.82302.jar`

## Version

This documentation is based on:

- **SLOOP Version**: 10.32.0.82302
- **Date**: 2025-11-11
- **Method**: Reverse engineering via CFR decompiler
