# Project Development Rules

## General
- Read relevant existing code before modifying anything.
- Follow the existing architecture, naming conventions, coding style, and folder structure.
- Prefer modifying or extending existing functionality instead of duplicating it.
- Do not modify unrelated files.
- Do not introduce new dependencies unless they provide clear value and are necessary.
- Do not modify `.env` files or expose secrets.
- Prefer simple, maintainable solutions over unnecessary abstractions.
- Optimize for code that is easy to understand, debug, test, extend, and replace later.

## Architecture & Modularity
- Prefer modular code over large monolithic files.
- Split large files when they contain multiple distinct responsibilities.
- Keep UI, business logic, data access, validation, API logic, and reusable utilities separated when practical.
- Prefer multiple focused files over one very large file when doing so improves maintainability.
- Do not split code into tiny files without a clear responsibility.
- Each module, component, service, or utility should have a clear purpose.
- Prefer feature-based organization when it matches the existing project architecture.
- Keep related code close together.
- Avoid circular dependencies.
- Avoid deeply coupled modules.
- Design modules with clear inputs and outputs.
- Prefer dependency boundaries that make individual parts easier to test and replace.

## File Size & Responsibility
- Avoid allowing a single file to continuously grow when it contains unrelated responsibilities.
- If a file becomes difficult to understand, navigate, test, or debug, consider refactoring it into focused modules.
- Large files should be split based on responsibility, not arbitrary line count.
- As a general warning sign, review files approaching roughly 300-500 lines and determine whether separation would improve maintainability.
- Do not split a cohesive file merely to satisfy a line-count target.
- When splitting files, preserve behavior and avoid unnecessary architectural changes.

## Coding
- Keep functions focused and reasonably small.
- Functions should ideally perform one clear responsibility.
- Prefer descriptive variable, function, class, component, and file names.
- Reuse existing utilities, hooks, services, types, and components.
- Maintain existing TypeScript types.
- Do not use `any` unless absolutely necessary.
- Prefer explicit types at important module boundaries.
- Avoid duplicated business logic.
- Extract repeated logic into reusable helpers only when doing so improves clarity.
- Avoid premature abstraction.
- Do not rewrite entire files when a targeted change is enough.
- Avoid unnecessary comments.
- Add comments when they explain important reasoning, constraints, workarounds, or non-obvious behavior rather than simply describing the code.

## Refactoring
- Refactor when it meaningfully improves readability, maintainability, testability, debugging, or future feature development.
- Keep refactoring scoped to code relevant to the current task unless broader refactoring is explicitly requested.
- Preserve existing behavior during refactoring unless behavior changes are part of the task.
- Prefer small, safe refactoring steps over large rewrites.
- Do not combine an unrelated architectural rewrite with a simple feature or bug fix.
- When modifying difficult or fragile code, improve its structure if doing so makes the requested change safer and easier to maintain.
- Extract complicated logic into clearly named functions, services, hooks, modules, or components when appropriate.
- Reduce excessive nesting and overly complex conditional logic.
- Prefer early returns or guard clauses when they improve readability.
- Remove dead code discovered directly within the scope of the task when safe.
- Do not perform large cleanup operations unrelated to the current task.

## Maintainability & Future Changes
- Structure code so future features can be added without rewriting unrelated functionality.
- Avoid hard-coding behavior that is likely to change.
- Prefer configuration, constants, enums, or typed options where appropriate.
- Keep business rules centralized rather than duplicated across multiple files.
- Keep public interfaces between modules small and predictable.
- Minimize hidden side effects.
- Prefer explicit data flow.
- Avoid creating abstractions for hypothetical future requirements with no current need.
- When adding a feature, consider how it will be debugged, tested, updated, and removed later.

## Debugging
- Prefer code structures that make errors easy to locate.
- Keep complex operations broken into identifiable stages where practical.
- Avoid giant functions containing validation, database operations, transformations, API calls, and response formatting all together.
- Preserve useful error context.
- Do not silently swallow errors.
- Handle errors at the appropriate layer.
- Use consistent error-handling patterns already established in the project.
- Avoid excessive logging.
- Add useful diagnostic logging only when it materially improves debugging.
- Never log secrets, passwords, API keys, tokens, sensitive personal data, or private credentials.
- When fixing a bug, identify the root cause rather than only masking the symptom.
- Add or update a regression test when practical so the same bug is less likely to return.

## Components & UI
- Keep components focused on a clear responsibility.
- Break large components into smaller components when they contain clearly separable UI or behavior.
- Keep reusable UI components generic when appropriate.
- Do not create abstractions for components that are only used once unless complexity justifies it.
- Keep complex business logic out of presentation components when practical.
- Extract reusable hooks or services when stateful logic is shared or significantly complicates a component.
- Preserve accessibility and existing responsive behavior when modifying UI.

## Backend / Services
- Keep route handlers and controllers relatively thin when practical.
- Move substantial business logic into appropriate services or domain modules.
- Keep database access organized according to the project's existing architecture.
- Validate external input at appropriate system boundaries.
- Do not trust client-provided data without validation.
- Keep authorization checks close to protected operations.
- Avoid duplicating authorization logic across unrelated locations when a shared mechanism already exists.

## API Changes
- Preserve backward compatibility unless breaking changes are explicitly required.
- Do not change API response shapes unnecessarily.
- Validate request data.
- Use existing error and response conventions.
- Update relevant types when API contracts change.
- Consider existing consumers before changing shared interfaces.

## Database Changes
- Do not perform migrations without explicit approval.
- Do not delete or destructively alter production data.
- Prefer backward-compatible schema changes when possible.
- Keep database logic separate from unrelated UI or presentation logic.
- Avoid inefficient repeated queries when an obvious existing pattern can prevent them.
- Do not introduce speculative database optimization without evidence or a clear reason.

## Before Editing
- Inspect relevant files before making changes.
- Understand how the feature currently works.
- Search for existing implementations, helpers, types, and patterns before creating new ones.
- Identify the minimum set of files that need modification.
- Determine whether the existing structure supports the change cleanly.
- If the current structure would make the requested feature fragile or difficult to maintain, propose a small relevant refactor.
- For non-trivial changes, briefly explain the implementation plan before editing.
- Do not begin a large architectural rewrite without explaining why it is necessary.

## During Implementation
- Make changes incrementally.
- Keep changes scoped to the requested task.
- Preserve existing behavior outside the requested change.
- Use existing project patterns before inventing new patterns.
- Update imports, types, tests, and callers when moving or extracting code.
- Check for duplicated implementation before creating new modules.
- Do not leave temporary debugging code, commented-out code, or unfinished placeholders unless explicitly requested.

## Testing
- Run relevant tests after changes.
- Add tests for important new behavior when practical.
- Add regression tests for bug fixes when practical.
- Run type checking when applicable.
- Run linting when applicable.
- Fix errors caused by your changes.
- Do not silently remove, skip, weaken, or rewrite failing tests simply to make the test suite pass.
- Do not alter expected test behavior unless the underlying requirement has changed.
- Prefer focused tests for changed functionality before running unnecessarily large test suites.

## Code Review Before Completion
Before considering a task complete:
- Review changed files for unnecessary modifications.
- Check for duplicated code introduced by the change.
- Check for unused imports, variables, functions, and files.
- Check for accidental debug logging.
- Check whether any new large function or file should reasonably be split.
- Check whether error handling is adequate.
- Check whether relevant types need updating.
- Check whether tests cover the important behavior.
- Confirm unrelated functionality was not intentionally changed.
- Prefer the smallest clean implementation that fully satisfies the requirement.

## Security
- Never expose secrets, passwords, API keys, access tokens, refresh tokens, private keys, or credentials.
- Do not weaken authentication or authorization to make a feature work.
- Do not disable validation, security checks, or permission checks merely to resolve an error.
- Treat all external input as untrusted.
- Follow existing security patterns in the project.
- Flag security-sensitive changes clearly before making broad modifications.

## Safety
- If a requested action could cause significant data loss or production impact, explain the risk before performing it.

## Dependencies
- Prefer existing dependencies before adding new ones.
- Do not install a package for functionality that can be implemented cleanly using existing project tools.
- Before adding a dependency, check whether the project already includes an equivalent solution.
- Avoid unnecessary dependency churn.
- Do not upgrade unrelated packages as part of a feature or bug fix.

## Cost / Token Efficiency
- Do not repeatedly read files that are already understood unless they have changed or need verification.
- Search for relevant files before opening large numbers of files.
- Inspect targeted sections of large files when sufficient.
- Do not explore unrelated directories.
- Do not read generated files, build artifacts, dependencies, or vendor directories unless necessary.
- Keep explanations concise unless more detail is requested.
- Do not repeatedly restate the task or project rules.
- Reuse already established task context.
- Prefer targeted searches over broad repository-wide reading.
- Stop and explain if the task is becoming significantly larger than originally requested.
- If a problem cannot be resolved after reasonable attempts, explain what is blocking progress rather than repeatedly attempting speculative changes.

## Decision Principle

When choosing between implementations, prefer the solution that is:

1. Correct.
2. Simple.
3. Consistent with the existing project.
4. Easy to understand.
5. Easy to debug.
6. Easy to test.
7. Easy to extend.
8. Minimally coupled.
9. Secure.
10. Scoped to the current task.

Do not sacrifice simplicity and maintainability for unnecessary abstraction or theoretical future flexibility.