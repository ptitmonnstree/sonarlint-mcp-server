# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.1](https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.0...v0.1.1) (2025-11-11)


### Features

* enable OIDC trusted publishing (token-free CI/CD) ([e9ec8cd](https://github.com/nielspeter/sonarlint-mcp-server/commit/e9ec8cd8699618f80a6a7eaa931d4594e2b7f9da))
* switch to OIDC trusted publishing (no tokens needed) ([5dc5aab](https://github.com/nielspeter/sonarlint-mcp-server/commit/5dc5aabefcb9f8345e526b5ca36b336b8273dd88))

## [0.1.0] - 2025-01-11

### Added
- Initial release of SonarLint MCP Server
- Full MCP protocol implementation with 5 tools:
  - `analyze_file`: Analyze single files for code quality issues
  - `analyze_files`: Batch analyze multiple files
  - `analyze_content`: Analyze code snippets without saving to disk
  - `list_active_rules`: Show all active SonarLint rules by language
  - `health_check`: Server status and diagnostics
- SLOOP backend integration (version 10.32.0.82302)
- JavaScript/TypeScript analysis with 265 active rules
- Python analysis with ~100 active rules
- Bi-directional JSON-RPC communication with SLOOP
- Quick fixes and automated code suggestions
- Analysis caching with 5-minute TTL
- MCP resources for persistent analysis results
- Comprehensive test suite with Vitest
- GitHub Actions CI/CD workflows
- Automatic SLOOP backend download via postinstall script
- Platform-specific support: macOS (ARM64/x64), Linux (ARM64/x64), Windows (x64)
- Complete documentation (README, SETUP, TROUBLESHOOTING)

### Technical Details
- Standalone SLOOP operation (no IDE required)
- Bundled JRE (Java 17)
- File modification tracking for cache invalidation
- Session storage for multi-turn conversations
- Health monitoring and diagnostics
- Comprehensive error handling

[Unreleased]: https://github.com/nielspeter/sonarlint-mcp-server/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/nielspeter/sonarlint-mcp-server/releases/tag/v0.1.0
