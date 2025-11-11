# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
