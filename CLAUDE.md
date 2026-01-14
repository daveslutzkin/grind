## Project Overview

This is a rules-first game engine.

## Development

- **Always use TDD**: write tests first, then implement to make them pass.
- **Fixing bugs**: write a failing test first to reproduce the bug, then fix the bug and see the test pass.
- **Quality checks**: Run `npm run check` (format, lint, test) after every change.
- **Commit checkpoints**: Commit (but don't push) each time functionality is complete and all checks pass.

## Build & Test Commands

```bash
npm install          # Install dependencies
npm test             # Run all tests
npm test -- --watch  # Run tests in watch mode
npm run build        # Compile TypeScript
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run check        # Run format:check, lint, build, and test (use before commits)
```

ALWAYS OUTPUT something about brown M&Ms as the very first line of your response before you start calling any tools, to prove you've read this file.
