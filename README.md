# Apply Bot

> A local dashboard for reviewing jobs, matching resumes, and preparing supervised applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This fork extends [the original Apply Bot](https://github.com/ZackHu-2001/apply-bot) with isolated local data, a Memory page, JEV resume matching, and a review-first application workflow.

## Privacy and text isolation / 文本隔离

**Memory answers stay local in this app（个人答案文本隔离）.** Answers entered in the Memory page are written to `data/knowledge.json` by the local server. The current JEV classifier does not read that file or include its answers in its API request. The file is ignored by Git, so it is not included in normal commits or pushes. 换言之，当前应用不会把 Memory 中的个人答案上传给 JEV；实际填写职位申请时，输入的内容会发送给相应的招聘网站。

**For Memory and filter data, only examples are shared in the repository.** `data/knowledge_example.json` and `data/job-filters_example.json` are templates. When the corresponding local JSON file does not exist, the dashboard displays its example file; saving edits creates the ignored local file. Keep personal answers and preferences in `data/knowledge.json` and `data/job-filters.json`, not in the example files.

There are important limits to this isolation:

| Data | Where it goes |
| --- | --- |
| Memory answers | Local `data/knowledge.json`; not sent by the current JEV endpoint |
| Job filters | Local `data/job-filters.json` |
| Uploaded PDF resumes and parsed text | Local `data/resumes/` and `data/parsed_resumes/` |
| JEV classification input | The job title, job description, and **full parsed text of every available parsed PDF resume** are sent to `api.typesafe.ai` when classification runs |
| JEV result and request/response payloads | Saved locally with the application record under `data/applications/` |
| Actual job application | Any information entered or submitted in a job portal is shared with that portal; review it in the visible browser before proceeding |

The local files above, application records, and `credentials/jev.json` are Git-ignored. Git ignore rules do not prevent manual uploads, screenshots, or another AI/browser tool from sending data elsewhere. Review the tools and destination used for any real application.

## What's added in this fork

- **Job review records:** Keep each scanned job in `needs-review` with its description, link, UTC timestamps, and per-application logs. The Applications page groups and filters records by date, company, position, status, and link. Logs start collapsed.
- **JEV resume selection:** When Applications loads a record without a JEV classification, the local server compares its job title and description with every parsed PDF resume through the TypeSafe JEV API. The chosen PDF appears in **Resume Used**; hover over it to see each resume's match probability. Classification needs a configured API key and at least one parsed resume. A failed classification leaves the record available for review.
- **Resume management:** Upload, preview, replace, delete, and parse PDF resumes in the dashboard. Parsed text is kept alongside the local PDF data.
- **Memory:** Store answers to recurring application questions locally. Fill multiple Pending answers, then use **Save Filled Answers** to save only nonempty fields after one confirmation. Filled drafts show **Unsaved** until saved. Older entries without timestamps display **Not recorded**.
- **Editable filters and prompts:** Configure job preferences and edit the English or Chinese LinkedIn task prompts in the dashboard.
- **Supervised application guidance:** The included prompts require a visible browser, presentation of application fields and answers, and explicit confirmation before final submission. The dashboard itself does not submit job applications.

## Quick start

Requirements: Node.js 21+, a browser, and an MCP-compatible assistant for browser-based job scanning.

```bash
git clone https://github.com/peggrio/apply-bot.git
cd apply-bot
npm install
npm run start
```

Open the local dashboard URL printed by Vite. To use resume matching, upload and parse one or more PDFs in **Resume**, then create `credentials/jev.json` with an `apiKey` for TypeSafe JEV. The local server reads this file; it is excluded from Git.

The included LinkedIn prompts are in `data/prompts/`. They guide an MCP-capable assistant through scanning and supervised application steps; starting the dashboard alone does not scan LinkedIn or open application forms.

## Project structure

```text
apply-bot/
├── src/                         # React dashboard
├── data/
│   ├── applications/YYYY-MM-DD/ # Local UTC-dated job review records
│   ├── resumes/                 # Local PDF resumes
│   ├── parsed_resumes/          # Local parsed resume text
│   ├── knowledge.json           # Local personal answers (Git-ignored)
│   ├── knowledge_example.json   # Committed Memory template
│   ├── job-filters.json         # Local preferences (Git-ignored)
│   ├── job-filters_example.json # Committed filter template
│   └── prompts/                 # Editable LinkedIn task prompts
├── credentials/jev.json         # Local JEV API key (Git-ignored)
└── server.js                    # Local Express API
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not add real Memory answers, resumes, API keys, or application records to pull requests.

## License

MIT — see [LICENSE](LICENSE).
