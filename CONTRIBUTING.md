# Contributing to Notification System

Thank you for your interest in contributing to the Notification System! This document provides guidelines and instructions for contributing.

## 🎯 Code of Conduct

This project follows a Code of Conduct. Please be respectful and constructive in all interactions.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop
- Git

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/notification-system.git
   cd notification-system
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start services:
   ```bash
   npm run docker:up
   ```
5. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```
6. Start development server:
   ```bash
   npm run start:dev
   ```

## 📝 Development Workflow

### Branching Strategy

- `main` - Production-ready code
- `develop` - Development branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Write/update tests for your changes

4. Ensure all tests pass:
   ```bash
   npm run test
   npm run test:e2e
   ```

5. Lint your code:
   ```bash
   npm run lint
   npm run format:check
   ```

6. Commit with descriptive message:
   ```bash
   git commit -m "feat: add user notification preferences"
   ```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Test additions or updates
- `chore:` - Build process or tooling changes
- `perf:` - Performance improvements

Examples:
```
feat: add scheduled notification support
fix: resolve race condition in cache invalidation
docs: update API documentation for webhook endpoints
refactor: extract notification processor into separate service
test: add integration tests for retry queue
```

### Pull Request Process

1. Update documentation for any API changes
2. Add tests for new functionality
3. Ensure all tests pass and lint is clean
4. Update CHANGELOG.md with your changes
5. Create a Pull Request with:
   - Clear title and description
   - Link to related issues
   - Screenshots/videos for UI changes
   - Test results

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] CHANGELOG updated
```

## 🧪 Testing Guidelines

### Unit Tests

- Write tests for all new services and controllers
- Aim for > 80% code coverage
- Use descriptive test names: `it('should return 404 when notification not found')`
- Mock external dependencies (database, Kafka, Redis)

### Integration Tests

- Test complete API flows
- Use actual database (Docker containers)
- Verify error scenarios
- Test authentication and authorization

### E2E Tests

- Test critical user journeys
- Verify system behavior under load
- Test failover scenarios

## 📐 Code Style

### TypeScript

- Use strict TypeScript mode
- Prefer interfaces over types for objects
- Use enums for fixed sets of values
- Document complex logic with comments
- Keep functions small and focused (< 50 lines)

### NestJS

- Use dependency injection
- Follow module-based architecture
- Use DTOs for request validation
- Implement proper error handling
- Use guards for authentication/authorization

### Naming Conventions

- **Files**: kebab-case (`notification.service.ts`)
- **Classes**: PascalCase (`NotificationService`)
- **Interfaces**: PascalCase with `I` prefix (`INotification`)
- **Variables**: camelCase (`notificationId`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Functions**: camelCase (`sendNotification()`)

## 🐛 Reporting Bugs

### Bug Report Template

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. ...

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., Ubuntu 22.04]
- Node version: [e.g., 20.10.0]
- Docker version: [e.g., 24.0.0]

## Screenshots/Logs
If applicable
```

## 💡 Feature Requests

### Feature Request Template

```markdown
## Feature Description
Clear description of the feature

## Problem Statement
What problem does this solve?

## Proposed Solution
How would you implement this?

## Alternatives Considered
What other solutions did you consider?

## Additional Context
Screenshots, mockups, or examples
```

## 📚 Documentation

- Update README for user-facing changes
- Update API documentation for endpoint changes
- Add JSDoc comments for public APIs
- Update architecture diagrams if needed
- Include examples for new features

## 🔍 Code Review

### As a Reviewer

- Be constructive and respectful
- Explain reasoning for requested changes
- Approve when satisfied or suggest improvements
- Test changes locally if needed

### As an Author

- Respond to all comments
- Make requested changes or explain reasoning
- Re-request review after updates
- Thank reviewers for their time

## 🎓 Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [Redis Documentation](https://redis.io/documentation)

## 📞 Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Create a GitHub Issue
- **Security**: Email security@example.com
- **Chat**: Join our Discord server

## 🙏 Recognition

Contributors will be recognized in:
- CHANGELOG.md for each release
- Contributors section in README
- Annual contributors report

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to the Notification System! 🚀