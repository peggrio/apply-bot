# LinkedIn Job Review Task

## Task Description

Open LinkedIn, search for software engineer positions in the San Francisco Bay Area posted within the last 24 hours, and collect the latest 2 job postings for my review.

## Supervised Real Application Mode

- Real applications are enabled only in a human-supervised browser session. Keep the browser open and visible for the entire application flow; never run this workflow headlessly or in the background.
- Present every page, field, question, uploaded document, and proposed answer before proceeding. Do not hide application state, request data, or navigation steps.
- The agent may inspect listings, select the JEV-recommended resume, open the application, and fill non-sensitive fields using explicitly approved information. Do not invent answers.
- Stop immediately before the final Apply, Easy Apply, Submit, Send, or equivalent action. Ask the user to review the complete application and explicitly confirm the exact final submission.
- Never submit an application without that action-time confirmation. If the user does not confirm, leave the form unsubmitted and record `"status": "needs-review"`.
- If an application asks about company-specific motivation, mission, values, products, or culture fit, stop and present the question for the user to answer or approve; do not draft or infer the answer.
- **Company-specific motivation/culture rule**: If an application asks questions such as "Why are you interested in [Company]?", "Why do you want to work here?", or anything about a specific company's mission, values, products, or culture fit, immediately classify the job as `needs-review`. Do not draft or infer an answer, do not continue the application flow, and never submit it automatically. This rule remains mandatory even if other automatic form-filling features are enabled in the future.

## Personal Information Sources

My personal information is stored in the `data/` folder:
- **`parsed_resumes/*.txt`** - Parsed text for each uploaded resume
- **`knowledge.json`** - Pre-answered application questions (work authorization, demographics, availability)
- **`job-filters.json`** - Job filtering preferences (blacklist/whitelist, salary, work type, tech stack)

## Operation Requirements

1. **Verbose Mode - Explain Every Step**: For each action you take, provide a brief explanation of:
   - What you are about to do
   - Why you are doing it (the reasoning/basis)
   - What information or rule you are following
   - Example: "Skipping this job because company 'XYZ' is in the job-filters.json blacklist"
   - Example: "Recording this job for review because it matches the configured location and technology filters"

2. **Minimize Operations**: Minimize snapshot calls. Collect all visible job details from each listing in as few read-only operations as possible.

2. **Information Processing**:
   - Use `data/job-filters.json` only to evaluate job relevance.
   - Do not use personal information to answer questions or populate forms.
   - Do not infer application-form answers or create new answers in `data/knowledge.json`.

3. **Job Review Records**:
   - After identifying each relevant job, **immediately** record the job posting information in `data/applications/YYYY-MM-DD/applications.json`, where `YYYY-MM-DD` is derived from `applicationTime` in UTC (GMT+0).
   - Create the UTC date directory and initialize `applications.json` as `[]` when they do not exist. Append the new record to the existing array; do not overwrite other records from the same day.
   - Record format:
     ```json
     {
       "company": "Company name",
       "jobTitle": "Job title",
       "jobDescription": "Complete About the job / job description text",
       "postedTime": "Job posting time (ISO 8601 timestamp, calculated from relative time)",
       "applicationTime": "Time the job was recorded for review (ISO 8601 UTC timestamp, e.g., 2025-11-17T00:16:12Z)",
       "status": "needs-review",
       "job_link": "Full job portal URL; if unavailable, the full LinkedIn job URL",
       "resume": null,
       "logs": [
         {
           "timestamp": "ISO timestamp",
           "action": "Brief action description",
           "reason": "Why this action was taken (detailed explanation)",
           "result": "Outcome of the action (optional)",
           "type": "info|success|warning|error"
         }
       ]
     }
     ```
   - **Important**: `applicationTime` must use the **actual timestamp** when the job is recorded. Use `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the current UTC time. Do not use fixed timestamps or placeholders.
   - **Required webpage sources**: `company`, `jobTitle`, and `postedTime` must all be read directly from the current job webpage. Do not infer them from the URL, cached search results, prior listings, or surrounding context.
   - **Exact text requirement**: Record `company` and `jobTitle` exactly as displayed on the job webpage, without guessing, rewriting, normalizing, or expanding abbreviations.
   - **Important**: `postedTime` must be calculated from the relative time displayed on LinkedIn (e.g., "7 hours ago", "2 days ago"). Calculate the actual timestamp by subtracting the duration from the current time. Use ISO 8601 format (e.g., 2025-11-17T00:16:12Z). This ensures the time is accurate and can be properly sorted.
   - If any of `company`, `jobTitle`, or the webpage's posted-time value cannot be read, do not create a record for that job.
   - **Important**: `jobDescription` is required. Capture the complete visible "About the job" content.
   - **Important**: `job_link` is required and must be a full URL. Prefer the external job portal URL; if it cannot be found, use the full LinkedIn job URL.
   - **Important**: `status` must always be exactly `"needs-review"`.
   - **Important**: Leave `resume` as `null`. The user selects a dedicated parsed resume for each job from the Applications dashboard.

4. **Supervised Application Flow**:
   - Use `data/job-filters.json` to decide whether a listing is relevant.
   - Reading the job page and its description is allowed.
   - Keep the browser open and visible and explain each navigation, field, answer, and resume choice.
   - Before entering sensitive personal information or uploading a resume, present the exact destination and data to the user and obtain confirmation.
   - Before final submission, present the complete application state and wait for explicit action-time confirmation.
   - Never bypass CAPTCHAs, security checks, login prompts, or external-site warnings; hand control to the user when required.

5. **Modal Close Optimization**:
   - **Problem**: When using `browser_click` to click close buttons (like "Done", "Dismiss"), although the modal is closed, the tool may still be waiting for the page to fully load or async operations to complete, causing slow response
   - **Reason**: LinkedIn may perform the following operations when closing modals:
     - Send analytics data to the server
     - Update page state
     - Trigger multiple event listeners
     - Wait for network requests to complete
   - **Solution**: Prioritize using the following fast close methods:
     1. **Press ESC key** (fastest): Use the `browser_press_key` tool to press the `Escape` key
     2. **Directly trigger ESC event**: Use `browser_evaluate` to execute:
        ```javascript
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        ```
     3. **Click background overlay**: If the modal has a close-on-background-click feature, click the background directly
   - **Note**: If you just need to close the modal and continue to the next operation, you don't need to wait for `browser_click` to complete. You can directly use `browser_evaluate` or `browser_press_key` to close quickly

6. **Other Tips**:
   - Do not submit through Easy Apply or an external portal without the explicit final confirmation described above.
   - If job details or application fields cannot be collected safely, stop and record the reason.

7. **Application Logging**:
   - Store logs directly in the relevant application's `logs` array. Do not create or update `data/logs.json`.
   - For each significant action related to that application, append:
     ```json
     {
       "timestamp": "ISO timestamp",
       "action": "Brief action description",
       "reason": "Why this action was taken (the verbose explanation)",
       "result": "Outcome of the action (optional)",
       "type": "info|success|warning|error"
     }
     ```
   - **Log these events**:
     - Starting review of a job (type: info)
     - Collecting job details (type: info)
     - Skipping a job and why (type: warning)
     - Successfully creating a needs-review record (type: success)
     - Errors or issues encountered (type: error)
     - Using assumed answers (type: warning)
   - Every new application must include at least one log entry explaining why the job was recorded.

## File Structure

```
apply-bot/
├── data/
│   ├── resumes/ (uploaded PDF resumes)
│   ├── parsed_resumes/ (one parsed .txt per PDF resume)
│   ├── applications/
│   │   └── YYYY-MM-DD/applications.json (application records grouped by UTC date)
│   ├── knowledge.json (local pre-answered questions; gitignored)
│   ├── knowledge_example.json (shareable empty template)
│   ├── job-filters.json (local job filtering preferences; gitignored)
│   └── job-filters_example.json (shareable empty filter template)
└── readme.md (this file)
```
