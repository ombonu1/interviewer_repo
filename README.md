# RDEC Interviewer

An AI-powered assistant for documenting software R&D projects to support **HMRC-compliant RDEC (Research and Development Expenditure Credit) claims**. This full-stack application guides engineers through structured interviews to capture technically rigorous documentation of their development work.

## Overview

RDEC Interviewer helps companies qualify for UK tax relief on software development by ensuring their technical documentation meets HMRC standards. The application uses AI agents to conduct intelligent interviews, validate technical depth, and assist tax teams in the claims process.

### Key Features

- **AI-Powered Interviewer**: Intelligent agent that conducts structured interviews about R&D activities
- **Technical Validation**: Ensures documentation contains sufficient technical depth (not generic business complaints)
- **Document Processing**: Parse and extract information from existing technical documents
- **Scoring & Assessment**: Automatically evaluate technical rigor of submitted descriptions
- **Tax Team Tools**: Dashboard and review tools for finance/tax teams to assess claims
- **Session Management**: Save and resume interview sessions
- **Multi-step Workflow**: Guide users through all required fields for RDEC compliance

## Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **AI Agent Framework**: Google ADK (for LLM agents)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Document Processing**: python-docx, PyPDF2
- **Server**: Uvicorn

### Frontend
- **Framework**: Next.js 16 (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Notifications**: React Hot Toast
- **HTTP Client**: Fetch API

### Infrastructure
- **Containers**: Docker & Docker Compose
- **Environment**: .env configuration

## Project Structure

```
Interviewer/
├── backend/                          # FastAPI application
│   ├── agents/                       # AI agent implementations
│   │   ├── interviewer.py           # Main interview conductor
│   │   ├── scorer_agent.py          # Technical depth evaluation
│   │   ├── reviewer_copilot.py      # Tax team assistant
│   │   ├── draft_parser.py          # Document parsing
│   │   └── schemas/                 # Output schemas for each agent
│   ├── routers/                      # API endpoints
│   │   ├── chat.py                  # Interview chat endpoints
│   │   ├── reviewer.py              # Tax team review endpoints
│   │   └── client.py                # Client/UI endpoints
│   ├── agent_tools/                 # Tools for agents
│   │   └── document_tools.py
│   ├── data/                         # Persistent data
│   │   ├── approved_queries/
│   │   ├── saved_sessions/          # Interview session storage
│   │   ├── submissions/             # RDEC claim submissions
│   │   └── exports/
│   ├── core/                         # Core utilities
│   │   └── config.py                # Configuration & directories
│   ├── utils/                        # Helper functions
│   │   └── helpers.py
│   ├── main.py                       # FastAPI application entry
│   ├── config.py                     # Environment & model config
│   ├── model_schemas.py              # Pydantic models
│   ├── requirements.txt              # Python dependencies
│   └── Dockerfile
│
├── frontend/                         # Next.js application
│   ├── app/                          # App directory (Next.js 13+)
│   │   ├── (interviewer)/            # Interviewer routes
│   │   │   ├── chat/
│   │   │   └── setup/
│   │   ├── (reviewer)/               # Reviewer routes
│   │   │   └── dashboard/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/                   # React components
│   │   ├── ChatSidebar.tsx
│   │   ├── LiveDocumentViewer.tsx
│   │   ├── TaxTeamChatWidget.tsx
│   │   ├── reviewer/                 # Tax team UI components
│   │   │   ├── AuditModal.tsx
│   │   │   ├── SubmissionTable.tsx
│   │   │   └── SubmissionCard.tsx
│   │   └── ClaimsDirectory.tsx
│   ├── lib/                          # Utilities
│   │   └── api.ts
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.mjs
│   └── Dockerfile
│
├── docker-compose.yml                # Multi-container orchestration
└── .env                              # Environment variables (not in repo)
```

## Getting Started

### Prerequisites

- Docker & Docker Compose (recommended)
- OR: Python 3.10+, Node.js 18+, PostgreSQL 12+
- Google ADK API Key (for AI agent functionality)

### Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd Interviewer
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start services**
   ```bash
   docker-compose up --build
   ```

   - Backend: http://localhost:8000
   - Frontend: http://localhost:3000

### Local Development Setup

#### Backend

1. Create and activate virtual environment
   ```bash
   python -m venv backend/.venv
   source backend/.venv/bin/activate  # Linux/Mac
   # or
   backend\.venv\Scripts\activate  # Windows
   ```

2. Install dependencies
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Configure environment
   ```bash
   cp .env.example .env
   # Edit .env with database credentials and API keys
   ```

4. Run development server
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

#### Frontend

1. Install dependencies
   ```bash
   cd frontend
   npm install
   ```

2. Start development server
   ```bash
   npm run dev
   ```

   Frontend available at http://localhost:3000

## API Endpoints

### Chat/Interview Routes
- `POST /api/chat/start` - Start new interview session
- `POST /api/chat/message` - Send message in interview
- `POST /api/chat/save` - Save current session
- `GET /api/chat/sessions/:sessionId` - Retrieve saved session

### Client Routes
- `GET /api/claims` - Get user's claims
- `GET /api/submissions` - Get submissions list
- `GET /api/exports` - Download claim export

### Reviewer Routes
- `GET /api/reviewer/dashboard` - Tax team dashboard
- `GET /api/reviewer/submissions` - View submissions for review
- `POST /api/reviewer/audit` - Audit a submission
- `PUT /api/reviewer/approve` - Approve a claim

## How It Works

### Interview Flow

1. **User Initiation**: Engineer starts interview on the frontend
2. **Agent Interview**: Interviewer agent asks structured questions about:
   - Technical challenges encountered
   - R&D decisions made
   - Technologies used
   - Algorithmic/architectural innovations
3. **Technical Validation**: 
   - Rejects generic answers (e.g., "too slow", "kept crashing")
   - Requires specific technical details
   - Enforces HMRC compliance standards
4. **Document Parsing** (optional): Users can upload existing technical docs
   - Draft Parser extracts relevant R&D descriptions
   - Scorer validates technical depth
5. **Session Storage**: Interviews saved in `/backend/data/saved_sessions/`
6. **Export & Review**: Tax team reviews and exports final claims

### AI Agents

**Interviewer Agent**
- Conducts guided interview with smart follow-ups
- Validates technical depth and rigor
- Guides users toward HMRC-compliant descriptions
- Handles session state management

**Scorer Agent**
- Evaluates technical depth of descriptions
- Assesses RDEC eligibility
- Provides feedback on submitted content

**Reviewer Copilot**
- Assists tax teams in claim review
- Suggests improvements or issues
- Generates audit reports

**Draft Parser**
- Extracts text from PDFs and DOCX files
- Identifies potential RDEC-relevant content
- Prepares content for interviewer validation

## Configuration

### Environment Variables

```env
# API Keys
GOOGLE_API_KEY=<your-google-adk-key>

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/rdec

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000

# Models
DEFAULT_MODEL=claude-opus-4-20250805

# Logging
LOG_LEVEL=INFO
```

## Project Workflow

```
User Interview → Validation → Storage → Tax Review → Export
                      ↓
              [Weak? Loop back]
```

## Data Storage

- **Sessions**: `/backend/data/saved_sessions/` - JSON interview state
- **Submissions**: `/backend/data/submissions/` - Completed claims
- **Exports**: `/backend/data/exports/` - Generated RDEC documents
- **Logs**: Application logs for audit trails

## Development

### Running Tests

```bash
cd backend
pytest
```

### Linting

```bash
# Backend
cd backend && pylint agents/ routers/ utils/

# Frontend
cd frontend && npm run lint
```

### Building for Production

```bash
# Using Docker (recommended)
docker-compose -f docker-compose.yml build

# Or locally
cd backend && pip install -r requirements.txt
cd frontend && npm run build
```

## Troubleshooting

**Backend fails to start**
- Check `.env` file has `GOOGLE_API_KEY` set
- Verify PostgreSQL is running (if using local DB)
- Check logs: `docker-compose logs backend`

**Frontend can't reach API**
- Ensure `NEXT_PUBLIC_API_URL` is correctly set
- Verify backend is running on port 8000
- Check CORS settings in `backend/main.py`

**Session data not persisting**
- Ensure `/backend/data/` directory is writable
- In Docker, verify volume mount: `./backend/data:/app/data`

## Support

For questions or issues:
- Check existing documentation in `/backend/agents/` for agent-specific behavior
- Review API responses in browser DevTools Network tab
- Check application logs in `/backend/data/logs/`
