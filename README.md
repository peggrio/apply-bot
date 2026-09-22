# Apply Bot

> AI-powered job application assistant - describe what you want, it handles the rest.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Website](https://apply-bot.com) | [Video Demo](#video-demo) | [Setup Guide](https://docs.apply-bot.com) | [Issues](https://github.com/ZackHu-2001/apply-bot/issues)

---

## Video Demo

[![Apply Bot Demo](public/apply-bot.gif)](http://youtube.com/watch?v=BcPL9qGtJdg&t=15s)

---

## Features

- **Natural Language Control** - Just describe the jobs you want
- **Real Browser Integration** - Uses your actual browser session
- **Privacy-First** - All data stored locally
- **Smart Filtering** - Whitelist/blacklist companies, skip certain jobs
- **Application Tracking** - Track all submissions in one place
- **Application Logging** - Detailed action and reasoning logs stored with each application

## Quick Example

```
You: "Apply to Software Engineer positions in Vancouver posted in last 24 hours on LinkedIn"

Bot: Searches, filters, and applies automatically based on your resume and preferences.
```

## Requirements

- Node.js 21+
- Chrome/Edge browser
- MCP-compatible AI tool (Claude Desktop, Cursor, VSCode, Windsurf, etc.)

## Quick Start

```bash
# Clone the repo
git clone https://github.com/ZackHu-2001/apply-bot.git
cd apply-bot

# Install dependencies
npm install

# Start the dashboard & backend service
npm run start
```

See the full [Setup Guide](https://docs.apply-bot.com) for detailed instructions.

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Express.js
- **Browser Automation**: Playwright MCP Server
- **AI**: Any MCP-compatible LLM

## Project Structure

```
apply-bot/
├── src/           # React frontend
├── data/          # Local data storage
│   ├── applications/     # Application records grouped by UTC date (local only)
│   ├── resumes/          # Uploaded PDF resumes (local only)
│   ├── parsed_resumes/   # One parsed text file per resume (local only)
│   ├── knowledge.json    # Local user answers (gitignored)
│   ├── knowledge_example.json # Shareable memory template
│   ├── prompts.json      # Prompt templates
│   ├── job-filters.json  # Local filter preferences (gitignored)
│   └── job-filters_example.json # Shareable filter template
└── server.js      # Express backend
```

## Contributing

PRs welcome! See [Contributing Guide](CONTRIBUTING.md).

## License

MIT - see [LICENSE](LICENSE)

---

**Disclaimer**: Use responsibly and comply with platform terms of service.
