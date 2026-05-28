# ArchView – AI Context Builder & Project Structure Explorer

Build AI context fast. Map your project, select the files that matter, compress tokens, and paste directly into Claude, Copilot, ChatGPT, or any LLM — without leaving VS Code.

---

## Why ArchView

When you work with AI models you constantly face the same friction: copy this file, paste it, copy that one, clean up the noise, count tokens, repeat. ArchView removes that loop. You pick the files once, optimize them with one click, and your context is ready to paste.

---

## Features

### Files Panel

Browse your entire project from a dedicated sidebar panel. Every file is one click away from being added to your AI context. Right-click any file in the VS Code explorer to add it directly.

The panel auto-refreshes when files are created, modified, or deleted, and re-syncs when you switch back to the VS Code window.

### Project Structure

A live tree view of your project structure, visible in the sidebar and in the VS Code explorer panel. Refresh it at any time or copy the full structure to your clipboard to paste into a prompt.

The floating project tree (`ArchView: Show Project Tree`) opens a standalone panel with a full hierarchy view — useful when you need to explain your architecture to a model.

### AI Context

The core of ArchView. A dedicated tree view where you build and manage the exact set of files you want to send to an AI model.

**Adding files:** right-click any file in the VS Code explorer and select *Add to ArchView Context*, or use the Files panel. Files are listed with their token count.

**Removing and excluding:** remove a file from the current context, or exclude it permanently so it never appears in suggestions. Exclusions can be cleared at any time.

**Token analysis:** select any file in the AI Context tree to analyze its token usage, preview how it will look after optimization, or check its dependencies.

### Token Optimization

Three optimization profiles let you control the trade-off between compression and readability:

| Profile | What it does |
|---|---|
| **Fast** | Removes comments, blank lines, and extra whitespace |
| **Balanced** | Fast + compact JSON, pattern detection, content truncation |
| **AI Max** | Balanced + log summarization and aggressive compression |

Switch profiles from the AI Context panel toolbar. Preview the result before copying with *Preview Optimization*.

### Summarize with Claude

Connect your Anthropic API key and use the *Summarize with Claude* command to generate an AI summary of your selected files. The summary is optimized for use as context in a subsequent prompt.

Set your key in VS Code settings under `archview.anthropicApiKey` or `archview.claudeApiKey`.

### Optimize & Copy

One-click command that applies the active optimization profile to all files in your AI Context and copies the result to the clipboard. Ready to paste into any AI chat.

---

## Getting Started

1. Open a project folder in VS Code.
2. Click the ArchView icon in the Activity Bar.
3. Add files to the AI Context panel by right-clicking them in the explorer.
4. Click *Optimize & Copy* in the AI Context toolbar.
5. Paste into your AI model of choice.

---

## Configuration

| Setting | Description |
|---|---|
| `archview.anthropicApiKey` | Anthropic API key for the AI button in the Files panel |
| `archview.claudeApiKey` | Anthropic API key for *Summarize with Claude* in the AI Context panel |
| `archview.defaultProfile` | Default optimization profile: `fast`, `balanced`, or `ai_max` |

---

## Commands

| Command | Description |
|---|---|
| `ArchView: Refresh Project Structure` | Reloads the project structure view |
| `ArchView: Copy Project Structure` | Copies the full project tree to clipboard |
| `ArchView: Show Project Tree` | Opens the floating project tree panel |
| `Add to ArchView Context` | Adds a file to the AI Context (right-click in explorer) |
| `Optimize & Copy` | Optimizes and copies all context files to clipboard |
| `Summarize with Claude` | Generates an AI summary of selected files |
| `Preview Optimization` | Shows a preview of the optimized file output |
| `Analyze Token Usage` | Shows the token count breakdown for a file |
| `Analyze Dependencies` | Shows the dependency graph for a file |
| `Exclude from Context` | Permanently excludes a file from the AI Context |
| `Clear All Exclusions` | Removes all exclusions |
| `Select Optimization Profile` | Opens the profile picker |

---

## Works with any LLM

ArchView is model-agnostic. The output is plain text you can paste anywhere: Claude, ChatGPT, Gemini, Copilot Chat, Cursor, or any other AI tool. The Claude integration is optional and only needed for the *Summarize* feature.

---
## Supported Project Types

ArchView works with almost any project structure that Visual Studio Code can open.

### Fully Supported
- Flask
- FastAPI
- Django
- Node.js
- Express
- TypeScript
- React
- Vue
- Next.js
- NestJS
- Electron

### Also Compatible With
- Python projects
- Java projects
- PHP projects
- Monorepos
- Full-stack applications
- Static websites
- Game development projects
- AI/ML repositories
- Any custom folder structure
---

## License

MIT
