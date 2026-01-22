---
name: 🐛 Bug Report
about: Create a report to help us improve the VSCode extension
title: '[Bug]: '
labels: bug
assignees: ''

---

## 📝 Description

**What's happening?**  
<!-- A clear and concise description of the bug you're experiencing. -->



---

## 🖥️ Environment

Help us understand your setup by providing the following details:

| Item | Value |
|------|-------|
| **Operating System** | Windows 11, macOS 14, Ubuntu 22.04 |
| **Shell** | bash, zsh, PowerShell, cmd |
| **Project Framework** | Nx, Next.js, NestJS, Create React App, Vite |
| **Test Framework** | Jest or Vitest |
| **Project Type** | Monorepo or Single App |
| **VSCode Version** | 1.100.0 (lowest supported version) |
| **Extension Version** | 0.4.93 |
| **Last Working Version** | 0.4.92 |

**🔧 Debug Logging**

Please set `jestrunner.enableDebugLogs` to `true` in your VSCode settings and include any relevant debug output below. This helps us diagnose issues more effectively.

```
1. Open the test file where you have the issue
2. Go to the OUTPUT panel (View → Output)
3. Select "Jest Runner" from the dropdown
4. Copy the debug output
```

**📁 Project Structure**  
<!-- Where is your jest/vitest config located? Where are your test files? Any special setup? -->

```
Example:
├── jest.config.js (root level)
├── src/
│   └── components/
│       └── Button.test.tsx
```

**⚙️ Jest/Vitest Configuration**
<!-- Please paste the relevant parts of your jest.config.js/vitest.config.ts -->

```js
// Paste your config here
```

---

## 🔄 Steps to Reproduce

Please provide detailed steps to reproduce the issue:

1. <!-- First step -->
2. <!-- Second step -->
3. <!-- Third step -->

---

## ✅ Expected Behavior

<!-- What did you expect to happen? -->



---

## ❌ Actual Behavior

<!-- What actually happened instead? -->



---

## 📋 Test Command Output

**Console/Terminal Output:**  
<!-- If applicable, paste the full output from running your test command -->

<details>
<summary>Click to expand output</summary>

```
Paste your test command output here
```

</details>

---

## 📸 Screenshots or Recordings

<!-- If applicable, add screenshots or screen recordings to help explain the problem -->



---

## 💡 Additional Context

<!-- Add any other context about the problem here. For example:
- Does this happen with all tests or specific ones?
- Did this start after updating VSCode/the extension/your dependencies?
- Any relevant configuration from your jest.config.js or vitest.config.ts?
-->

