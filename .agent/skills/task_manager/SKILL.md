---
name: Task Manager
description: Automatically persist and retrieve user task lists.
---

# Task Manager Skill

This skill allows you to maintain a persistent list of tasks for the project, stored in `.agent/tasks.md`.

## Capabilities

### 1. Auto-Save Tasks
**Trigger**: When the user provides a numbered or bulleted list of tasks/requirements (e.g., "Here is the plan:", "Do these steps:", "Todo list:").

**Action**:
1.  Extract the task list content.
2.  Overwrite or append to `e:/Html-work/.agent/tasks.md`.
3.  Confirm to the user that the tasks have been saved.

### 2. Show Tasks
**Trigger**: When the user asks "What are the tasks?", "Show my list", "Check checklist", etc.

**Action**:
1.  Use `view_file` to read `e:/Html-work/.agent/tasks.md`.
2.  Present the content to the user in a formatted Markdown block.

## Storage File
- Path: `e:/Html-work/.agent/tasks.md`
- format: Standard Markdown checklist (`- [ ] Task`).

## Usage Tips
- Always check `.agent/tasks.md` at the start of a session if the user asks "Where were we?".
- When completing a task, you can also proactively update `.agent/tasks.md` to mark items as checked `[x]`, using `replace_file_content`.
