import { EventEmitter } from "events";

interface SonarLintStatus {
  ideName: string;
  description: string;
  needsToken: boolean;
  capabilities: {
    canOpenFixSuggestion: boolean;
  };
}

export class SonarLintBridge extends EventEmitter {
  private connected = false;
  private readonly baseUrl: string;
  private readonly sonarQubeServerUrl: string;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeout = 30000,
    sonarQubeServerUrl?: string
  ) {
    super();
    this.baseUrl = `http://${host}:${port}`;
    // Default to common SonarQube server URL
    this.sonarQubeServerUrl = sonarQubeServerUrl || "http://localhost:9000";
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Test connection by calling the status endpoint
      const status = await this.getStatus();
      this.connected = true;
      console.log(`Connected to ${status.ideName}`);
    } catch (error) {
      this.connected = false;
      throw new Error(`Failed to connect to SonarLint IDE at ${this.baseUrl}: ${error}`);
    }
  }

  private async fetchAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    // Always include the Origin header - required by SonarLint IDE
    const headers = {
      'Origin': this.sonarQubeServerUrl,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok && response.status !== 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }

    return response.text();
  }

  async getStatus(): Promise<SonarLintStatus> {
    return this.fetchAPI('/sonarlint/api/status');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  // NOTE: The SonarLint IDE API is primarily designed for "Open in IDE" functionality
  // from SonarQube Server/Cloud. The following methods are placeholders that would need
  // proper endpoint discovery and authentication tokens to work.

  // The actual endpoints and their full capabilities are not publicly documented.
  // This implementation shows what we've discovered so far.

  async getCurrentIssues(filters?: any): Promise<any[]> {
    throw new Error("Direct issue querying not supported by SonarLint IDE API. Use SonarQube Server API instead.");
  }

  async requestAnalysis(filePaths: string[]): Promise<string> {
    throw new Error("Analysis triggering not supported by SonarLint IDE API.");
  }

  async waitForAnalysisResults(analysisId: string): Promise<any> {
    throw new Error("Analysis results not available from IDE API.");
  }

  async getFileIssues(filePath: string, includeFixed = false): Promise<any[]> {
    throw new Error("Direct file issue querying not supported. Use SonarQube Server API.");
  }

  async getProjectMetrics(options?: any): Promise<any> {
    throw new Error("Project metrics not available from IDE API. Use SonarQube Server API.");
  }

  async toggleAutoAnalysis(enabled: boolean): Promise<void> {
    throw new Error("Auto-analysis toggle not available via API.");
  }

  async getRuleDetails(ruleKey: string): Promise<any> {
    throw new Error("Rule details not available from IDE API. Use SonarQube Server API.");
  }

  async getSecurityHotspots(filters?: any): Promise<any[]> {
    throw new Error("Security hotspots not available from IDE API. Use SonarQube Server API.");
  }
}
