# MOODY 项目开发避坑指南 & 知识库

本文档总结了在 MOODY 音乐应用开发过程中（特别是 Mock 数据集成与乱码修复阶段）遇到的关键问题及其解决方案。旨在为后续开发提供经验参考，避免重蹈覆辙。

## 1. 乱码问题专题 (The "Encoding Hell")

乱码问题通常是全栈性的，单一环节的修复往往无效。必须确保数据从"产生"到"存储"再到"传输"和"显示"的每一环都严格使用 UTF-8。

### 1.1 后端 (Go)
**现象**：后端返回的 JSON 数据在浏览器中显示为乱码，或者包含 Unicode 转义字符（如 `\u003c`）。

**解决方案**：
*   **设置正确的 Content-Type**：
    必须显式指定 `charset=utf-8`，否则某些客户端会回退到默认编码（如 ISO-8859-1 或 GBK）。
    ```go
    w.Header().Set("Content-Type", "application/json; charset=utf-8")
    ```
*   **禁用 HTML 转义**：
    Go 的 `json.Encoder` 默认会转义 HTML 敏感字符（`<`, `>`, `&`），这对 API 数据来说通常是不必要的，且会增加数据大小。
    ```go
    encoder := json.NewEncoder(w)
    encoder.SetEscapeHTML(false) // 关键！
    encoder.Encode(data)
    ```

### 1.2 数据库 (SQLite)
**现象**：插入的中文字符在数据库查看工具中乱码，或者读取出来乱码。

**解决方案**：
*   **连接字符串**：在 Go 中使用 `modernc.org/sqlite` 或 `mattn/go-sqlite3` 时，虽然 SQLite 默认 UTF-8，但确保环境一致性很重要。
*   **彻底重置**：如果数据库文件（`.db`）中已经写入了乱码数据，**不要尝试通过代码转换修复数据**。最快的方法是删除 `.db` 文件，修复代码中的编码逻辑，然后重新导入数据。

### 1.3 前端 (JavaScript)
**现象**：`.js` 文件中的硬编码中文（如 "本地音乐"）在浏览器显示为 `æœ¬åœ°éŸ³ä¹ `。

**原因**：
*   文件保存时未使用 UTF-8 编码。
*   或者文件被编辑器/脚本以错误编码（如 Latin-1）读取后保存，导致 UTF-8 字节序列被错误地解释为字符。

**修复技巧（脚本化修复）**：
当源码已经乱码时，通过查找"中文字符"无法定位问题。需要利用**上下文定位**。

*   **Bad Approach**: 尝试搜索 "本地音乐" 或即使是搜索 "æœ¬åœ°..." (容易因不同环境解析差异失败)。
*   **Good Approach (Context-based Regex)**:
    ```powershell
    # PowerShell 示例
    # 原文: <div class="name">æœ¬åœ°...</div>
    # 替换逻辑: 找到 class="name" 的 div，替换其内部所有内容
    $content = $content -replace '(?s)<div class="name">.*?</div>', '<div class="name">本地音乐</div>'
    ```
    *注：`(?s)` 开启单行模式，允许 `.` 匹配换行符。*

### 1.4 逻辑一致性陷阱
**现象**：修复了 UI 显示的乱码，但功能突然失效（如"没数据了"）。

**原因**：如果代码逻辑依赖于字符串比较（Magic Strings），修复 UI 字符串时容易漏掉逻辑判断处的字符串。

*   **案例**：
    ```javascript
    // 修复前
    // viewState.category = 'å…¨éƒ¨'; // 乱码
    // if (viewState.category !== 'å…¨éƒ¨') ...

    // 修复了一半
    // viewState.category = '全部'; // 修复了这
    // if (viewState.category !== 'å…¨éƒ¨') ... // 漏了这！导致条件成立，逻辑错误。
    ```
**教训**：Search & Replace 时必须全局搜索，不仅要看 UI 渲染代码，还要看 `if/switch` 等逻辑代码。

## 2. PowerShell 脚本避坑
在 Windows 环境下维护项目，PowerShell 是强大的工具，但有几个巨坑：

1.  **编码参数**：
    始终显式指定 `-Encoding UTF8`。如果不指定，`Get-Content` 可能根据系统 Locale 读取（如 GBK），导致 UTF-8 文件瞬间被破坏。
    ```powershell
    Get-Content $file -Raw -Encoding UTF8  # 正确
    ```
2.  **换行符字面量**：
    PowerShell 中的 `` `r`n `` 是特殊字符（CRLF）。
    *   在双引号字符串中 `"`r`n"` -> 实际的换行符。
    *   在单引号字符串中 `'`r`n'` -> 字面文本（4个字符）。
    小心不要把字面量 `'`r`n'` 写入到 JS 文件中，这会导致 JS 语法错误。

## 3. Mock 数据集成
在 Node.js 脚本中处理前端数据文件（如 `data.js`）时：

*   **环境模拟**：前端文件可能依赖 `window` 或 `document`。在 Node 中 `eval` 或 `require` 之前，需要模拟这些对象：
    ```javascript
    global.window = {}; // Mock window
    // 读取文件内容并 eval
    ```
*   **变量声明**：`const` 在重复执行或 `eval` 上下文中可能导致"变量已声明"错误。如果在脚本中直接处理，可能需要临时替换为 `var`。
*   **SQL 生成**：将 JS 对象转换为 SQL 插入语句时，必须处理字符串中的单引号 `'`，否则 SQL 执行会报错。
    ```javascript
    str.replace(/'/g, "''") // SQLite 转义
    ```

## 4. 开发工作流建议
1.  **验证先行**：修改乱码后，第一步**看浏览器**，第二步**看控制台**（是否有语法错误），第三步**检查功能**（点击是否有反应）。
2.  **原子化提交**：修复编码问题时，不要混合功能修改。编码修复往往涉及大量文件变动，混合提交会加大回滚难度。
3.  **终极手段**：如果文件乱码无法挽回，与其花费 1 小时尝试转码修复，不如花费 10 分钟重写（或从 Git 历史恢复）受影响的代码块。
