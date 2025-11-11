# SonarLint SLOOP RPC Protocol Documentation

## Overview

SLOOP (SonarLint LOcal OPerations) is the backend analysis engine used by SonarQube for IDE plugins. It communicates via **bi-directional JSON-RPC** over stdin/stdout using LSP-style message framing.

**CRITICAL**: SLOOP uses bi-directional RPC - the server sends requests TO the client! You must implement client-side RPC handlers.

## Communication Protocol

### Message Format

Messages use LSP-style format with Content-Length header:

```
Content-Length: {byte_count}\r\n\r\n{json_payload}
```

Example:

```
Content-Length: 123\r\n\r\n{"jsonrpc":"2.0","id":"1","method":"initialize","params":{...}}
```

### JSON-RPC Structure

```typescript
interface Request {
  jsonrpc: "2.0";
  id: string;
  method: string;  // Requests have a method field
  params?: any;
}

interface Response {
  jsonrpc: "2.0";
  id: string;
  // Responses do NOT have a method field
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface Notification {
  jsonrpc: "2.0";
  method: string;
  // Notifications do NOT have an id field
  params?: any;
}
```

### Message Routing Logic

**CRITICAL**: Distinguish between requests and responses by checking for the `method` field:

```typescript
if (message.id && message.method) {
  // Request FROM SLOOP - handle it!
  handleClientRequest(message);
} else if (message.id && !message.method) {
  // Response TO our request - resolve promise
  resolveRequest(message);
} else if (!message.id && message.method) {
  // Notification from SLOOP - emit event
  emitNotification(message);
}
```

## Starting SLOOP

```bash
java -Xms384m \
  -XX:+UseG1GC \
  -XX:MaxHeapFreeRatio=20 \
  -XX:MinHeapFreeRatio=10 \
  -XX:+UseStringDeduplication \
  -XX:MaxGCPauseMillis=50 \
  -XX:ParallelGCThreads=2 \
  -Djava.awt.headless=true \
  -classpath "/path/to/sonarlint-intellij/sloop/lib/*" \
  org.sonarsource.sonarlint.core.backend.cli.SonarLintServerCli
```

## Required: Client RPC Handlers

SLOOP will send these requests TO your client. You MUST implement handlers:

### 1. `listFiles` - **MOST CRITICAL!**

**IMPORTANT**: This is the most complex client handler. SLOOP requires `ClientFileDto` objects with file content!

Request from SLOOP:

```json
{
  "id": "1",
  "method": "listFiles",
  "params": {
    "configScopeId": "my-project"
  }
}
```

Your response (each file must be a `ClientFileDto` object):

```json
{
  "id": "1",
  "result": {
    "files": [
      {
        "uri": "file:///path/to/file.js",
        "fsPath": "/path/to/file.js",
        "ideRelativePath": "src/file.js",
        "configScopeId": "my-project",
        "isTest": false,
        "charset": "UTF-8",
        "content": "const x = 1;\n",
        "detectedLanguage": "JS",
        "isUserDefined": true
        // CRITICAL! Must be true or SLOOP will filter it out!
      }
    ]
  }
}
```

**CRITICAL FIELDS:**

- `content` - **The actual file content!** SLOOP needs this to analyze.
- `isUserDefined` - **MUST be `true`!** If false, SLOOP filters out the file with message: "Filtered out URIs not user-defined"
- `detectedLanguage` - One of: `"JS"`, `"TS"`, `"PYTHON"`, `"JAVA"`, `"HTML"`, `"CSS"`, etc.

### 2. `getBaseDir`

Request from SLOOP:

```json
{
  "id": "2",
  "method": "getBaseDir",
  "params": {
    "configurationScopeId": "my-project"
  }
}
```

Your response:

```json
{
  "id": "2",
  "result": {
    "path": "/absolute/path/to/project"
  }
}
```

### 3. `getFileExclusions`

Request from SLOOP:

```json
{
  "id": "3",
  "method": "getFileExclusions",
  "params": {
    "configurationScopeId": "my-project"
  }
}
```

Your response (note the field name!):

```json
{
  "id": "3",
  "result": {
    "fileExclusionPatterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**"
    ]
  }
}
```

### 4. `getInferredAnalysisProperties`

Request from SLOOP:

```json
{
  "id": "4",
  "method": "getInferredAnalysisProperties",
  "params": {
    "configurationScopeId": "my-project"
  }
}
```

Your response:

```json
{
  "id": "4",
  "result": {
    "properties": {}
    // Can be empty for defaults
  }
}
```

## Initialization

### `initialize(InitializeParams)` - REQUIRED

**CRITICAL**: Must include `backendCapabilities` or PluginsService will fail!

```typescript
interface InitializeParams {
  clientConstantInfo: {
    name: string;
    userAgent: string;
  };

  // REQUIRED! Without this, Spring initialization fails
  backendCapabilities: Array<
    'DATAFLOW_BUG_DETECTION' | 'SECURITY_HOTSPOTS' | 'SMART_NOTIFICATIONS' |
    'PROJECT_SYNCHRONIZATION' | 'EMBEDDED_SERVER' | 'SERVER_SENT_EVENTS'
  >;

  telemetryConstantAttributes: {
    productKey: string;
    productName: string;
    productVersion: string;
    ideVersion: string;
    additionalAttributes: Record<string, string>;
  };

  httpConfiguration: {
    sslConfiguration: {
      trustStorePath: string | null;
      trustStorePassword: string | null;
      trustStoreType: string | null;
      keyStorePath: string | null;
      keyStorePassword: string | null;
      keyStoreType: string | null;
    };
    connectTimeout: string; // ISO-8601 duration, e.g., "PT30S"
    socketTimeout: string;
    connectionRequestTimeout: string;
    responseTimeout: string;
  };

  alternativeSonarCloudEnvironment: string | null;

  featureFlags: {
    shouldManageSmartNotifications: boolean;
    shouldManageServerSentEvents: boolean;
    shouldSynchronizeProjects: boolean;
    shouldManageLocalServer: boolean;
    isEnablesSecurityHotspots: boolean;
    isEnabledDataflowBugDetection: boolean;
    shouldManageFullSynchronization: boolean;
    isEnabledTelemetry: boolean;
    isEnabledMonitoring: boolean;
  };

  storageRoot: string; // Path for storing analysis data
  workDir: string; // Path for temporary files
  embeddedPluginPaths: string[]; // Paths to .jar files
  connectedModeEmbeddedPluginPathsByKey: Record<string, string>;
  enabledLanguagesInStandaloneMode: Language[];
  extraEnabledLanguagesInConnectedMode: Language[];
  disabledPluginKeysForAnalysis: string[];
  sonarQubeConnections: SonarQubeConnectionConfig[];
  sonarCloudConnections: SonarCloudConnectionConfig[];
  sonarlintUserHome: string;
  standaloneRuleConfigByKey: Record<string, RuleConfig>;
  isFocusOnNewCode: boolean;

  languageSpecificRequirements: {
    jsTsRequirements?: {
      clientNodeJsPath: string;
      bundlePath: string; // Path to eslint-bridge package
    };
    omnisharpRequirements?: {
      monoDistributionPath: string;
      dotNet6DistributionPath: string;
      dotNet472DistributionPath: string;
      ossAnalyzerPath: string | null;
      enterpriseAnalyzerPath: string | null;
    };
  };

  isAutomaticAnalysisEnabled: boolean;
  telemetryMigration: any | null;
}
```

### Example Initialize Call

```javascript
await sendRequest('initialize', {
  clientConstantInfo: {
    name: 'SonarLint MCP Server',
    userAgent: 'sonarlint-mcp/1.0'
  },

  // CRITICAL: Required for PluginsService
  backendCapabilities: ['DATAFLOW_BUG_DETECTION', 'SECURITY_HOTSPOTS'],

  telemetryConstantAttributes: {
    productKey: 'mcp',
    productName: 'SonarLint MCP Server',
    productVersion: '1.0.0',
    ideVersion: '1.0.0',
    additionalAttributes: {}
  },

  httpConfiguration: {
    sslConfiguration: {
      trustStorePath: null,
      trustStorePassword: null,
      trustStoreType: null,
      keyStorePath: null,
      keyStorePassword: null,
      keyStoreType: null
    },
    connectTimeout: 'PT30S',
    socketTimeout: 'PT1M',
    connectionRequestTimeout: 'PT30S',
    responseTimeout: 'PT1M'
  },

  alternativeSonarCloudEnvironment: null,

  featureFlags: {
    shouldManageSmartNotifications: false,
    shouldManageServerSentEvents: false,
    shouldSynchronizeProjects: false,
    shouldManageLocalServer: true,
    isEnablesSecurityHotspots: true,
    isEnabledDataflowBugDetection: true,
    shouldManageFullSynchronization: false,
    isEnabledTelemetry: false,
    isEnabledMonitoring: false
  },

  storageRoot: '/path/to/storage',
  workDir: '/path/to/work',
  embeddedPluginPaths: [/* array of .jar paths */],
  connectedModeEmbeddedPluginPathsByKey: {},
  enabledLanguagesInStandaloneMode: ['JS', 'TS', 'PYTHON', 'JAVA'],
  extraEnabledLanguagesInConnectedMode: [],
  disabledPluginKeysForAnalysis: [],
  sonarQubeConnections: [],
  sonarCloudConnections: [],
  sonarlintUserHome: '/path/to/home',
  standaloneRuleConfigByKey: {},
  isFocusOnNewCode: false,

  languageSpecificRequirements: {
    jsTsRequirements: {
      clientNodeJsPath: '/path/to/node',
      bundlePath: '/path/to/eslint-bridge/package'
    }
  },

  isAutomaticAnalysisEnabled: true,
  telemetryMigration: null
});
```

## Configuration Scopes

Before analysis, register a configuration scope:

```javascript
// This is a notification (no response expected)
sendNotification('configuration/didAddConfigurationScopes', {
  addedScopes: [{
    id: 'my-project',
    parentId: null,
    bindable: false,
    name: 'My Project',
    binding: null
  }]
});
```

## Analysis Service

### `analyzeFilesAndTrack` - RECOMMENDED

The primary analysis method that returns results directly:

```typescript
interface AnalyzeFilesAndTrackParams {
  configurationScopeId: string;  // Note: different from analyzeFileList!
  analysisId: string;  // UUID for this analysis
  filesToAnalyze: string[];  // Array of file:// URIs
  extraProperties: Record<string, string>;
  shouldFetchServerIssues: boolean;
}

interface AnalyzeFilesResponse {
  failedAnalysisFiles: string[];  // URIs of files that failed
  rawIssues: RawIssue[];  // Issues found
}

interface RawIssue {
  ruleKey: string;  // e.g., "javascript:S1481"
  message: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT';
  // ... additional fields
}
```

Example:

```javascript
const result = await sendRequest('analysis/analyzeFilesAndTrack', {
  configurationScopeId: 'my-project',
  analysisId: '550e8400-e29b-41d4-a716-446655440000',
  filesToAnalyze: ['file:///path/to/file.js'],
  extraProperties: {},
  shouldFetchServerIssues: false
});

console.log(result);
// {
//   failedAnalysisFiles: [],
//   rawIssues: [
//     {
//       ruleKey: "javascript:S1481",
//       message: "Remove this unused variable 'x'",
//       ...
//     }
//   ]
// }
```

### `analyzeFileList` - Alternative

Returns a UUID, results may come via notifications:

```typescript
interface AnalyzeFileListParams {
  configScopeId: string;  // Note: different field name!
  filesToAnalyze: string[];  // Array of file:// URIs
}
```

### Other Analysis Methods

- `analyzeOpenFiles(AnalyzeOpenFilesParams)` - Analyze open files
- `analyzeFullProject(AnalyzeFullProjectParams)` - Full project analysis
- `analyzeVCSChangedFiles(AnalyzeVCSChangedFilesParams)` - VCS changes
- `getRuleDetails(GetRuleDetailsParams)` - Get rule information

## File Operations

### Notify File Open

```javascript
sendNotification('file/didOpenFile', {
  configurationScopeId: 'my-project',
  fileUri: 'file:///path/to/file.js'
});
```

### Notify File Close

```javascript
sendNotification('file/didCloseFile', {
  configurationScopeId: 'my-project',
  fileUri: 'file:///path/to/file.js'
});
```

## Issue Service

### Get Issue Details

```typescript
interface GetEffectiveIssueDetailsParams {
  configurationScopeId: string;
  issueId: string;
}
```

### Change Issue Status

```typescript
interface ChangeIssueStatusParams {
  configurationScopeId: string;
  issueId: string;
  newStatus: 'WONT_FIX' | 'FALSE_POSITIVE' | 'ACCEPT';
  comment?: string;
}
```

## Notifications from SLOOP

### Log Messages

```typescript
interface LogNotification {
  method: "log";
  params: {
    level: "ERROR" | "WARN" | "INFO" | "DEBUG";
    message: string;
    configScopeId: string | null;
    threadName: string;
    loggerName: string;
    stackTrace: string | null;
    loggedAt: number;  // Unix timestamp
  };
}
```

### Analysis Readiness

```typescript
interface AnalysisReadinessNotification {
  method: "didChangeAnalysisReadiness";
  params: {
    configurationScopeIds: string[];
    areReadyForAnalysis: boolean;
  };
}
```

### Progress Reporting

```typescript
interface ProgressNotification {
  method: "reportProgress";
  params: {
    taskId: string;
    notification: {
      // Progress details
    };
  };
}
```

## Languages Supported

```typescript
type Language =
  | "JS" | "TS" | "PYTHON" | "JAVA" | "HTML" | "CSS"
  | "PHP" | "GO" | "RUBY" | "KOTLIN" | "SCALA" | "XML"
  | "C" | "CPP" | "OBJC" | "SWIFT" | "CLOUDFORMATION"
  | "TERRAFORM" | "KUBERNETES" | "DOCKER" | "YAML" | "SECRETS";
```

## Plugin Locations

Language analyzer plugins (.jar files):

```
~/Library/Application Support/JetBrains/WebStorm2025.2/plugins/sonarlint-intellij/plugins/
  ├── sonar-javascript-plugin-*.jar
  ├── sonar-python-plugin-*.jar
  ├── sonar-java-plugin-*.jar
  ├── sonar-html-plugin-*.jar
  ├── sonar-php-plugin-*.jar
  ├── sonar-go-plugin-*.jar
  └── ... (other language plugins)
```

## Error Codes

Standard JSON-RPC error codes:

- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- `-32800`: Request cancelled
- `-32000 to -32099`: Server-defined errors

## Complete Working Example

```typescript
import {spawn} from 'child_process';
import {EventEmitter} from 'events';

class SloopBridge extends EventEmitter {
  private process: ChildProcess;
  private messageBuffer = '';
  private messageId = 0;
  private pendingRequests = new Map();

  async connect() {
    this.process = spawn('java', [
      '-Xms384m',
      '-XX:+UseG1GC',
      '-Djava.awt.headless=true',
      '-classpath', '/path/to/sloop/lib/*',
      'org.sonarsource.sonarlint.core.backend.cli.SonarLintServerCli'
    ], {stdio: ['pipe', 'pipe', 'pipe']});

    this.process.stdout.on('data', (data) => {
      this.messageBuffer += data.toString();
      this.processMessages();
    });

    await this.initialize();
  }

  private processMessages() {
    while (true) {
      const match = this.messageBuffer.match(/Content-Length: (\d+)\r?\n\r?\n/);
      if (!match) break;

      const length = parseInt(match[1]);
      const headerEnd = match.index! + match[0].length;
      const messageEnd = headerEnd + length;

      if (this.messageBuffer.length < messageEnd) break;

      const json = this.messageBuffer.substring(headerEnd, messageEnd);
      this.messageBuffer = this.messageBuffer.substring(messageEnd);

      const message = JSON.parse(json);
      this.handleMessage(message);
    }
  }

  private handleMessage(message: any) {
    // Request FROM SLOOP (has method)
    if (message.id && message.method) {
      this.handleClientRequest(message);
    }
    // Response TO our request (no method)
    else if (message.id && !message.method) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    }
    // Notification (no id)
    else if (!message.id && message.method) {
      this.emit('notification', message);
    }
  }

  private handleClientRequest(request: any) {
    if (request.method === 'listFiles') {
      const configScopeId = request.params?.configScopeId;
      const files = this.getProjectFiles(configScopeId);  // Get actual files with content
      this.sendResponse(request.id, {files});
    } else if (request.method === 'getBaseDir') {
      this.sendResponse(request.id, {path: process.cwd()});
    } else if (request.method === 'getFileExclusions') {
      this.sendResponse(request.id, {
        fileExclusionPatterns: ['node_modules/**', '.git/**']
      });
    } else if (request.method === 'getInferredAnalysisProperties') {
      this.sendResponse(request.id, {properties: {}});
    }
  }

  private getProjectFiles(configScopeId: string): any[] {
    // Example: Scan directory and create ClientFileDto objects
    const files: any[] = [];
    const baseDir = process.cwd();

    // Find all .js/.ts files
    const filePaths = this.scanDirectory(baseDir, /\.(js|ts)$/);

    for (const filePath of filePaths) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(baseDir, filePath);

      files.push({
        uri: `file://${filePath}`,
        fsPath: filePath,
        ideRelativePath: relativePath,
        configScopeId: configScopeId,
        isTest: relativePath.includes('test'),
        charset: 'UTF-8',
        content: content,  // CRITICAL: Include file content!
        detectedLanguage: filePath.endsWith('.ts') ? 'TS' : 'JS',
        isUserDefined: true  // CRITICAL: Must be true!
      });
    }

    return files;
  }

  private sendResponse(id: string, result: any) {
    const message = {jsonrpc: '2.0', id, result};
    const json = JSON.stringify(message);
    const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
    this.process.stdin.write(content);
  }

  async sendRequest(method: string, params?: any) {
    const id = String(++this.messageId);
    const message = {jsonrpc: '2.0', id, method, params};

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }, 120000);

      this.pendingRequests.set(id, {resolve, reject, timeout});

      const json = JSON.stringify(message);
      const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
      this.process.stdin.write(content);
    });
  }

  async initialize() {
    await this.sendRequest('initialize', {
      clientConstantInfo: {name: 'MCP Server', userAgent: 'mcp/1.0'},
      backendCapabilities: ['DATAFLOW_BUG_DETECTION', 'SECURITY_HOTSPOTS'],
      // ... other params
    });
  }

  addConfigurationScope(id: string, name: string) {
    const message = {
      jsonrpc: '2.0',
      method: 'configuration/didAddConfigurationScopes',
      params: {
        addedScopes: [{id, parentId: null, bindable: false, name, binding: null}]
      }
    };
    const json = JSON.stringify(message);
    const content = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
    this.process.stdin.write(content);
  }

  async analyzeFiles(scopeId: string, files: string[]) {
    return this.sendRequest('analysis/analyzeFilesAndTrack', {
      configurationScopeId: scopeId,
      analysisId: crypto.randomUUID(),
      filesToAnalyze: files,
      extraProperties: {},
      shouldFetchServerIssues: false
    });
  }
}

// Usage
const bridge = new SloopBridge();
await bridge.connect();
bridge.addConfigurationScope('my-project', 'My Project');
const result = await bridge.analyzeFiles('my-project', ['file:///path/to/file.js']);
console.log(result.rawIssues);
```

## Troubleshooting

### Spring PluginsService Error

**Error**: `UnsatisfiedDependencyException: Error creating bean with name 'PluginsService'`

**Solution**: Add `backendCapabilities` to initialize params:

```javascript
backendCapabilities: ['DATAFLOW_BUG_DETECTION', 'SECURITY_HOTSPOTS']
```

### Analysis Timeout/Cancelled

**Error**: Request cancelled or timeout during analysis

**Solution**: Implement ALL required client handlers:

- `listFiles`
- `getBaseDir`
- `getFileExclusions` (with correct field name: `fileExclusionPatterns`)
- `getInferredAnalysisProperties`

### NullPointerException for "globPatterns"

**Error**: `Cannot invoke "java.util.Set.size()" because "globPatterns" is null`

**Solution**: Return `fileExclusionPatterns` (NOT `fileExclusions`) in getFileExclusions response

### Messages Not Received

**Issue**: Sent request but no response

**Solution**: Check message routing - requests have `method` field, responses don't

### "Analyzing 0 files" / No Issues Detected

**Error**: Analysis completes but reports 0 files analyzed and returns empty `rawIssues`

**Possible causes**:

1. **`isUserDefined: false`** - SLOOP filters with message "Filtered out URIs not user-defined"
    - **Solution**: Set `isUserDefined: true` in all `ClientFileDto` objects

2. **`listFiles` returning empty array or URI strings** - SLOOP needs full `ClientFileDto` objects
    - **Solution**: Return proper `ClientFileDto` objects with `content`, `fsPath`, `detectedLanguage`, etc.

3. **File not in `listFiles` response** - SLOOP only analyzes files it knows about
    - **Solution**: Include the file in the `listFiles` response

### JavaScript Sensor Error: "Node.js script doesn't exist"

**Error**: `Node.js script to start the bridge server doesn't exist: .../package/package/bin/server.cjs`

**Symptom**: Notice the duplicate `/package/package/` in path

**Solution**: Set `bundlePath` to parent directory, not the package directory itself. SLOOP appends `/package/bin/server.cjs`:

```javascript
// ❌ Wrong
bundlePath: '/path/to/eslint-bridge/package'

// ✅ Correct
bundlePath: '/path/to/eslint-bridge'
```

### "Message could not be parsed" Error

**Error**: `org.eclipse.lsp4j.jsonrpc.MessageIssueException: Message could not be parsed`

**Possible causes**:

1. **Incorrect JSON structure** in `listFiles` response (e.g., returning string array instead of ClientFileDto objects)
2. **Invalid Content-Length** header - must match exact byte count of JSON
3. **Missing required fields** in ClientFileDto objects

**Solution**: Ensure `listFiles` returns array of complete `ClientFileDto` objects with all required fields

## References

- JAR files: `~/Library/Application Support/JetBrains/.../plugins/sonarlint-intellij/sloop/lib/`
- Protocol library: `sonarlint-rpc-protocol-10.32.0.82302.jar`
- Implementation: `sonarlint-rpc-impl-10.32.0.82302.jar`
- Core library: `sonarlint-core-10.32.0.82302.jar`
- JSON-RPC library: `org.eclipse.lsp4j.jsonrpc-0.22.0.jar`
