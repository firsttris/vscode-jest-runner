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

Due to the wide variety of project configurations, it is difficult to debug issues without specific details. Please provide as many information as possible so I can reproduce your setup.

Please provide the following details:

| Item | Value |
|------|-------|
| **Operating System** | Windows 11, macOS 14, Ubuntu 22.04 |
| **Shell** | bash, zsh, PowerShell, cmd, fish |
| **Project Framework** | Nx, Next.js, NestJS, Create React App, Vite |
| **Test Framework** | Jest or Vitest |
| **Jest/Vitest Config Name** | jest.config.js, jest.config.ts, vitest.config.ts |
| **Project Type** | Monorepo or Single App |
| **IDE** | VSCode, Antigravity, Cursor, Windsurf |
| **VSCode Version** | 1.100.0 (lowest supported version) |
| **Extension Version** | 0.4.XXX |
| **Last Working Version** | 0.4.XXX |

**🔧 Debug Logging**

If you set `jestrunner.enableDebugLogs` to `true` in your VSCode settings you can find out why its not working for you.

1. Open the test file where you have the issue (e.g. CodeLens is not displayed)
2. Go to the OUTPUT panel (View → Output)
3. Select "Jest Runner" from the dropdown

Here you can see:

- which framework config is being used
- which pattern is applied
- whether the current test file matches that pattern

 This should make it easy to track down why its not working for you.

4. Copy the debug output

```txt
// Paste your debug output here
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

It's very important that you provide the Jest/Vitest configuration file. The extension reads the framework config (globs/regex) from this file to enable the extension only in the corresponding directories.

<!-- Please paste the relevant parts of your jest.config.js/vitest.config.ts -->

```js
// Paste your config here
```

**🛠️ Extension Settings**
<!-- Please paste your VSCode settings for the extension (search for "jestrunner" in your settings.json) -->

```json
// Paste your jestrunner settings here
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

