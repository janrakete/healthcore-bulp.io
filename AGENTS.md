# AGENTS.md

Guidelines for AI agents working on this repository.

## 1. Understand Before Changing

- Understand the existing code and conventions before making changes.
- Do not guess when an important requirement is unclear. State assumptions or ask for clarification.
- If there are multiple reasonable approaches, choose the simplest one and briefly explain the trade-off.
- Do not introduce features, abstractions, or configuration that are not required.

## 2. Keep Changes Small

- Make the smallest change that correctly solves the task.
- Match the existing architecture, coding style, and patterns.
- Do not refactor unrelated code.
- Do not change existing behavior unless required by the task.
- Remove only unused code that your own changes made obsolete.
- Leave pre-existing dead code or unrelated issues untouched.

## 3. Healthcore Architecture

- Respect the existing separation between the Healthcore server, bridges, devices, and integrations.
- Prefer existing Healthcore patterns and utilities over introducing new frameworks or architectural patterns.
- Keep device-specific logic inside the appropriate bridge or converter.
- Do not move functionality between components unless the task requires it.
- Preserve existing MQTT topic structures, payload formats, and event names unless a breaking change is explicitly intended.
- Consider local/offline operation a core requirement. Do not introduce unnecessary dependencies on external services.

## 4. APIs and Compatibility

- Treat existing REST endpoints, MQTT interfaces, events, and data formats as public interfaces.
- Do not rename, remove, or change existing API behavior without explicitly considering backwards compatibility.
- When changing an API, update its documentation and relevant tests.
- Preserve existing authentication, authorization, CORS, and security behavior unless the task explicitly changes it.
- Never hard-code API keys, passwords, tokens, or other secrets.
- Do not commit `.env` files or credentials.

## 5. Database and Data

- Treat existing database schemas and stored data as persistent user data.
- Do not change or remove database columns, tables, or stored data without considering existing installations.
- Prefer migrations or backwards-compatible changes when a schema change is necessary.
- Do not delete or recreate a database simply to make development or tests easier.
- Keep database access consistent with the existing database layer and conventions.

## 6. Bridges, Devices and Integrations

- Existing device integrations must continue to work unless the task explicitly changes them.
- Do not assume that all devices behave according to the specification; account for established device-specific behavior where necessary.
- Keep converters and integration-specific workarounds localized to the relevant integration.
- Avoid introducing dependencies on vendor-specific libraries when the existing implementation can solve the problem without them.
- When changing an integration, test both the changed behavior and existing functionality where practical.

## 7. Tests and Verification

- Run the relevant existing tests before and after significant changes when practical.
- Add or update tests for new or changed behavior.
- For bug fixes, add a regression test whenever practical.
- Verify the actual result rather than assuming the implementation works.
- Use `/tests/setup.js` to run the test suite.
- Update `/tests/MANUAL.md` when manual testing is required.

## 8. Code Quality

- Keep new code readable and consistent with the existing codebase.
- Prefer clear, explicit code over clever or overly abbreviated code.
- Avoid unnecessary abstractions and duplication.
- Add comments only where they explain non-obvious reasoning or behavior; do not comment obvious code.
- Keep error handling appropriate to the actual failure modes. Do not add speculative error handling.

## 9. Documentation

- Update documentation when public behavior, configuration, APIs, installation, or user-visible functionality changes.
- Keep README and API documentation consistent with the actual implementation.
- Do not document functionality that does not exist.
- Prefer concise examples that can actually be executed or followed.

## 10. Before Finishing

- Review the final diff.
- Check for unintended changes, unused imports, debug code, secrets, and accidental behavior changes.
- Check that tests and documentation affected by the change are updated.
- Confirm that existing interfaces remain compatible unless a breaking change was intentional.
- Briefly report what changed and how it was verified.