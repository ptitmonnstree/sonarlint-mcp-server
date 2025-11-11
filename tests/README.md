# Test Suite

This directory contains the test suite for the SonarLint MCP Server.

## Structure

```
tests/
├── unit/                           # Unit tests (fast, no SLOOP)
│   ├── language-helpers.test.ts   # Language detection and mapping
│   └── client-file-dto.test.ts    # ClientFileDto construction
├── integration/                    # Integration tests (with SLOOP)
│   └── cache-invalidation.test.ts # End-to-end cache invalidation
└── fixtures/                       # Test fixture files
    └── sample.js                   # Sample file with known issues
```

## Running Tests

```bash
# Run all tests in watch mode
npm test

# Run tests once (CI mode)
npm run test:run

# Run with UI (interactive)
npm run test:ui

# Run with coverage
npm run test:coverage

# Run only unit tests (fast)
npm test -- tests/unit

# Run only integration tests
npm test -- tests/integration
```

## Test Philosophy

### Unit Tests
- **Fast**: No SLOOP backend required
- **Isolated**: Test individual functions
- **Coverage**: Test edge cases and error handling
- **Run first**: Quick feedback loop

### Integration Tests
- **Realistic**: Uses actual SLOOP backend
- **End-to-end**: Tests full workflow
- **Verification**: Confirms SLOOP cache invalidation works
- **Slower**: Requires SLOOP startup/shutdown

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { languageToEnum } from '../../src/helpers';

describe('languageToEnum', () => {
  it('should map javascript to JS', () => {
    expect(languageToEnum('javascript')).toBe('JS');
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startSloop, stopSloop, analyzeFile } from './helpers';

describe('Cache Invalidation', () => {
  beforeAll(async () => {
    await startSloop();
  });

  afterAll(async () => {
    await stopSloop();
  });

  it('should invalidate cache after quick fix', async () => {
    // Test implementation
  });
});
```

## Coverage Goals

- **Unit tests**: >90% coverage for helper functions
- **Integration tests**: Verify critical user flows work

## CI/CD

Tests run automatically on:
- Pull requests
- Main branch commits
- Pre-push hooks (if configured)
