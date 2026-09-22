# LinkedIn 职位审核任务

## 任务说明

打开 LinkedIn，搜索 24 小时内发布、且 location 在 San Francisco Bay Area 的 software engineer 岗位，收集最新的 2 条职位供我人工审核。

## 关键安全规则：禁止自动投递

- 全面停止自动化投递。不得点击 Apply、Easy Apply、Submit、Send 或任何等效按钮。
- 不得填写或推进任何申请表单。
- Agent 只能浏览职位、收集职位信息并创建待审核记录。
- 每条记录的状态必须且只能是 `"status": "needs-review"`。
- **特定公司动机/文化问题规则**：如果申请中出现类似 “Why are you interested in [Company]?”、“Why do you want to work here?”，或任何涉及特定公司使命、价值观、产品、文化契合度的问题，必须立即将该职位归类为 `needs-review`。不得自动撰写或推断答案，不得继续推进申请流程，也绝不能自动提交。即使未来恢复其他自动填表功能，这条规则也必须始终生效。

## 个人信息来源

我的个人信息存储在 `data/` 文件夹下：
- **`parsed_resumes/*.txt`** - 每份已上传简历各自对应的解析文本
- **`knowledge.json`** - 预先回答的申请问题（工作授权、人口统计、可用性信息）
- **`job-filters.json`** - 职位过滤偏好（黑白名单、薪资、工作类型、技术栈）

## 操作要求

1. **详细模式 - 解释每一步操作**：对于你执行的每一个操作，请简要说明：
   - 你要做什么
   - 为什么要这样做（依据/理由）
   - 你遵循的是什么信息或规则
   - 示例："跳过这个职位，因为公司 'XYZ' 在 job-filters.json 的黑名单中"
   - 示例："记录该职位供人工审核，因为它符合已配置的地区和技术筛选条件"

2. **减少操作次数**：尽量减少 snapshot 调用，以只读方式一次收集当前职位页面中所有可见信息。

2. **信息处理**：
   - 仅使用 `data/job-filters.json` 判断职位相关性。
   - 不得使用个人信息回答问题或填写表单。
   - 不得推断申请表问题的答案，也不得因此向 `data/knowledge.json` 新增答案。

3. **职位审核记录**：
   - 每识别出一个相关职位后，**立即**将岗位信息记录到 `data/applications/YYYY-MM-DD/applications.json`，其中 `YYYY-MM-DD` 必须根据 `applicationTime` 按 UTC（GMT+0）计算。
   - 如果对应日期目录或 `applications.json` 不存在，先创建目录并将文件初始化为 `[]`。将新记录追加到现有数组中，不要覆盖同一天的其他记录。
   - 记录格式：
     ```json
     {
       "company": "公司名",
       "jobTitle": "岗位名",
       "jobDescription": "完整的 About the job / 职位描述正文",
       "postedTime": "岗位发布时间（ISO 8601 时间戳，从相对时间计算得出）",
       "applicationTime": "记录该职位以供审核的时间（ISO 8601 UTC 格式，如：2025-11-17T00:16:12Z）",
       "status": "needs-review",
       "job_link": "完整的职位门户 URL；找不到时至少记录完整的 LinkedIn 职位 URL",
       "resume": null,
       "logs": [
         {
           "timestamp": "ISO 时间戳",
           "action": "简短操作描述",
           "reason": "为什么执行此操作（详细解释）",
           "result": "操作结果（可选）",
           "type": "info|success|warning|error"
         }
       ]
     }
     ```
   - **重要**：`applicationTime` 必须使用记录职位时的**实际时间戳**，使用 `date -u +"%Y-%m-%dT%H:%M:%SZ"` 获取当前 UTC 时间，不要使用固定时间戳或占位符。
   - **强制网页来源**：`company`、`jobTitle` 和 `postedTime` 必须全部直接从当前职位网页读取。不得根据 URL、缓存的搜索结果、之前的职位或上下文进行猜测。
   - **原文要求**：`company` 和 `jobTitle` 必须严格按照职位网页显示的文字记录，不得猜测、改写、规范化或自行展开缩写。
   - **重要**：`postedTime` 必须从 LinkedIn 显示的相对时间（如 "7 hours ago"、"2 days ago"）计算得出。通过从当前时间减去该时长来计算实际时间戳。使用 ISO 8601 格式（如 2025-11-17T00:16:12Z）。这样可以确保时间准确且可以正确排序。
   - 如果无法从网页读取 `company`、`jobTitle` 或网页显示的发布时间，则不得为该职位创建记录。
   - **重要**：`jobDescription` 为必填字段，必须记录页面中完整可见的 “About the job” 内容。
   - **重要**：`job_link` 为必填字段且必须是完整 URL。优先记录外部职位门户 URL；找不到时使用完整的 LinkedIn 职位 URL。
   - **重要**：`status` 必须始终严格等于 `"needs-review"`。
   - **重要**：将 `resume` 保持为 `null`。用户会在 Applications dashboard 中为每个职位选择专用的已解析简历。

4. **仅准备人工审核**：
   - 使用 `data/job-filters.json` 判断职位是否相关。
   - 可以读取职位页面和职位描述。
   - 严禁打开、填写或提交任何申请表单。

5. **弹窗关闭优化**：
   - **问题**：使用 `browser_click` 点击关闭按钮（如 "Done"、"Dismiss"）时，虽然弹窗已经关闭，但工具可能还在等待页面完全加载或异步操作完成，导致响应很慢
   - **原因**：LinkedIn 在关闭弹窗时可能执行了以下操作：
     - 发送分析数据到服务器
     - 更新页面状态
     - 触发多个事件监听器
     - 等待网络请求完成
   - **解决方案**：优先使用以下快速关闭方法：
     1. **按 ESC 键**（最快）：使用 `browser_press_key` 工具按 `Escape` 键
     2. **直接触发 ESC 事件**：使用 `browser_evaluate` 执行：
        ```javascript
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        ```
     3. **点击背景遮罩层**：如果弹窗有关闭背景点击功能，直接点击背景
   - **注意**：如果只是关闭弹窗继续下一步操作，不需要等待 `browser_click` 完成，可以直接使用 `browser_evaluate` 或 `browser_press_key` 快速关闭

6. **其他提示**：
   - 不得启动 Easy Apply 或外部职位门户的申请流程。
   - 如果无法收集完整职位信息，跳过并记录原因。

7. **Application 日志记录**：
   - 将日志直接保存到对应 application 的 `logs` 数组中，不再创建或更新 `data/logs.json`。
   - 对于与该 application 相关的每个重要操作，追加：
     ```json
     {
       "timestamp": "ISO 时间戳",
       "action": "简短操作描述",
       "reason": "为什么执行此操作（详细解释）",
       "result": "操作结果（可选）",
       "type": "info|success|warning|error"
     }
     ```
   - **记录这些事件**：
     - 开始审核某个职位 (type: info)
     - 收集职位信息 (type: info)
     - 跳过某个职位及原因 (type: warning)
     - 成功创建 needs-review 记录 (type: success)
     - 遇到错误或问题 (type: error)
     - 使用假设的答案 (type: warning)
   - 每条新 application 至少包含一条日志，解释为什么记录该职位。

## 文件结构

```
apply-bot/
├── data/
│   ├── resumes/ (上传的 PDF 简历)
│   ├── parsed_resumes/ (每份 PDF 各自对应一个解析后的 .txt)
│   ├── applications/
│   │   └── YYYY-MM-DD/applications.json (按 UTC 日期分组的申请记录)
│   ├── knowledge.json (本地预先回答的问题；已被 gitignore)
│   ├── knowledge_example.json (可共享的空白模板)
│   ├── job-filters.json (本地职位过滤偏好；已被 gitignore)
│   └── job-filters_example.json (可共享的空白筛选模板)
└── readme.md (本文件)
```
