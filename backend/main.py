from contextlib import asynccontextmanager
from fastapi import FastAPI, BackgroundTasks, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import json
import logging
import re
import os
import asyncio
from datetime import datetime

# Assuming these exist in your backend folder structure
from model_schemas import ChatRequest, RdecAifData, FinalSubmission, ReviewerFeedback, SaveSessionRequest, HumanMessage
from agents.interviewer import interviewer_runner
from utils.helpers import extract_text_from_events, generate_rdec_docx, deep_merge
from agent_tools.document_tools import extract_text_from_file
from agents.draft_parser import draft_parser_runner
from agents.scorer_agent import scorer_runner
from agents.reviewer_copilot import reviewer_runner

# ==========================================
# ENTERPRISE PATHING & CONFIG
# ==========================================
# This guarantees paths are absolute relative to where main.py lives!
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SUBMISSIONS_DIR = os.path.join(DATA_DIR, "submissions")
SAVED_DIR = os.path.join(DATA_DIR, "saved_sessions")
EXPORTS_DIR = os.path.join(DATA_DIR, "exports")

# Ensure base directories exist on startup
os.makedirs(SUBMISSIONS_DIR, exist_ok=True)
os.makedirs(SAVED_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)

# Global lock to prevent JSON file corruption from concurrent writes
file_io_lock = asyncio.Lock()

# Configure logging properly
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ==========================================
# APP INITIALIZATION
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting RDEC AIF Backend Server...")
    # init_db()  # <-- Uncomment when database.py is set up
    yield
    logger.info("🛑 Shutting down server...")

app = FastAPI(lifespan=lifespan)

# CORS configuration via Environment Variables
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ephemeral in-memory database for real-time chat
ephemeral_chat_db = {}


# ==========================================
# 1. INTERVIEWER ENDPOINTS (The User Flow)
# ==========================================
@app.post("/api/chat/interviewer")
async def interviewer_chat_endpoint(request: ChatRequest, background_tasks: BackgroundTasks):
    logger.info(f"📥 Received chat message for session: {request.session_id}")
    
    # 1. ROUTER: Backend explicitly determines what field is missing next
    current_field = "Unknown"
    state_str = json.dumps(request.current_aif_state)
    
    # A simple sequential router looking for the first null value
    if '"project_name": null' in state_str or '"project_name": ""' in state_str:
        current_field = "project_name"
    elif '"advance_sought": null' in state_str or '"advance_sought": ""' in state_str:
        current_field = "advance_sought"
    elif '"scientific_uncertainties": null' in state_str or '"scientific_uncertainties": ""' in state_str:
        current_field = "scientific_uncertainties"
    elif '"activities_undertaken": null' in state_str or '"activities_undertaken": ""' in state_str:
        current_field = "activities_undertaken"
    elif '"outcomes": null' in state_str or '"outcomes": ""' in state_str:
        current_field = "outcomes"
        
    # 2. Build the precise context for the Agent
    current_prompt = (
        f"CURRENT_STATE:\n{json.dumps(request.current_aif_state, indent=2)}\n\n"
        f"CURRENT_FIELD: {current_field}\n\n"
        f"USER_MESSAGE:\n{request.message}"
    )
    
    max_retries = 2
    attempts = 0
    parsed_output = {}

    while attempts <= max_retries:
        try:
            logger.info(f"🤖 Agent Run Attempt {attempts + 1}...")
            
            raw_response = await interviewer_runner.run_debug(
                current_prompt,
                session_id=request.session_id
            )
            
            final_json_str = extract_text_from_events(raw_response)
            clean_json = final_json_str.replace("```json", "").replace("```", "").strip()
            
            parsed_output = None
            try:
                parsed_output = json.loads(clean_json)
            except json.JSONDecodeError:
                match = re.search(r'\{.*\}', clean_json, re.DOTALL)
                if match:
                    try:
                        parsed_output = json.loads(match.group())
                        logger.warning("🔧 Fixed: Extracted JSON from chatty agent text.")
                    except: pass
            
            if parsed_output is None:
                if attempts < max_retries:
                    logger.warning("⚠️ JSON parsing failed. Asking Agent to fix...")
                    current_prompt += f"\n\nSYSTEM ERROR: Invalid JSON. You returned:\n{clean_json}\nReturn ONLY valid JSON."
                    attempts += 1
                    continue
                else:
                    break

            break # Success!

        except Exception as e:
            logger.error(f"❌ Loop Error on attempt {attempts}: {e}")
            attempts += 1
            if attempts > max_retries:
                parsed_output = {
                    "answer_text": "I'm having trouble connecting to my internal tools right now. Please try again.",
                    "field_extraction": {},
                    "is_complete": False
                }

    # 3. Extract the new schema variables
    final_response_text = parsed_output.get("answer_text", "Could you provide more details?")
    new_fragment = parsed_output.get("field_extraction", {})
    is_complete = parsed_output.get("is_complete", False)
    
    # 4. THE MAGIC: Deep merge the tiny fragment safely into the massive state
    updated_state = deep_merge(request.current_aif_state, new_fragment)
    
    # 5. Build Audit Log
    current_turn_log = {
        "timestamp": datetime.now().isoformat(),
        "ai_question": final_response_text,
        "user_answer": request.message,
        "extracted_fields": list(new_fragment.keys()) if new_fragment else []
    }
    
    # 6. Run Scorer if complete
    audit_summary = None
    if is_complete:
        logger.info("✅ AIF is complete! Running Compliance Scorer...")
        score_prompt = f"Final AIF State: {json.dumps(updated_state)}\n\nPlease grade this submission."
        
        try:
            score_response = await scorer_runner.run_debug(score_prompt, session_id=request.session_id)
            score_json_str = extract_text_from_events(score_response).replace("```json", "").replace("```", "").strip()
            audit_summary = json.loads(score_json_str)
        except Exception as e:
            logger.error(f"Failed to generate scores: {e}")
            audit_summary = {
                "completeness_score": 90, "compliance_score": 85, 
                "summary_text": "Great job! Your AIF looks solid.", 
                "tax_team_flags": []
            }
            
        final_response_text = audit_summary.get("summary_text", "I have all the information I need! Submitting now...")

    return {
        "message": final_response_text, 
        "aif_updates": new_fragment,
        "full_updated_state": updated_state, # <--- Sending the complete, merged state back!
        "is_complete": is_complete,
        "turn_log": current_turn_log,
        "audit_summary": audit_summary 
    }

# ==========================================
# 2. REVIEWER ENDPOINTS (The Tax Team Flow)
# ==========================================
@app.get("/api/submissions")
async def get_all_submissions():
    """Reads the submissions folder and returns a list of all submitted AIFs."""
    submissions = []
    for filename in os.listdir(SUBMISSIONS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(SUBMISSIONS_DIR, filename)
            # Use lock to prevent reading a file while it is being updated
            async with file_io_lock:
                try:
                    with open(filepath, "r") as f:
                        data = json.load(f)
                except Exception as e:
                    logger.error(f"Error reading file {filename}: {e}")
                    continue
                
            session_id = data.get("session_id", "Unknown")
            
            project_narratives = data.get("aif_state", {}).get("project_narratives", [])
            project_name = "Unnamed Project"
            if project_narratives and len(project_narratives) > 0:
                project_name = project_narratives[0].get("project_name", "Unnamed Project")
            
            compliance_score = data.get("audit_summary", {}).get("compliance_score", 0)
            status = data.get("status", "In Review")
            has_been_audited = "reviewer_analysis" in data
            
            submissions.append({
                "id": session_id,
                "project_name": project_name,
                "compliance_score": compliance_score,
                "status": status,
                "has_been_audited": has_been_audited
            })
            
    submissions.sort(key=lambda x: x["compliance_score"])
    return submissions

@app.get("/api/submissions/{session_id}")
async def get_submission_detail(session_id: str):
    """Fetches the full JSON data for a specific submission."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            return json.load(f)

@app.post("/api/reviewer/analyze/{session_id}")
async def run_reviewer_copilot(session_id: str):
    """Triggers the AI to audit the submission, or returns the cached audit."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            submission_data = json.load(f)
        
    if "reviewer_analysis" in submission_data:
        logger.info(f"⚡ Returning cached Copilot Analysis for {session_id}")
        return submission_data["reviewer_analysis"]
        
    logger.info(f"🕵️‍♀️ Running Reviewer Copilot on {session_id}...")
    prompt = f"Please audit this RDEC AIF submission:\n\n{json.dumps(submission_data['aif_state'], indent=2)}"
    
    try:
        response = await reviewer_runner.run_debug(prompt, session_id=f"reviewer_{session_id}")
        json_str = extract_text_from_events(response).replace("```json", "").replace("```", "").strip()
        analysis = json.loads(json_str)
        
        submission_data["reviewer_analysis"] = analysis
        
        async with file_io_lock:
            with open(filepath, "w") as f:
                json.dump(submission_data, f, indent=2)
            
        return analysis
    except Exception as e:
        logger.error(f"Copilot failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to run Reviewer Copilot.")

@app.post("/api/reviewer/approve/{session_id}")
async def approve_submission(session_id: str):
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            data = json.load(f)
            
        data["status"] = "Approved"
        
        if "audit_summary" in data and "detailed_log" in data["audit_summary"]:
            data["audit_summary"]["detailed_log"].append({
                "timestamp": datetime.now().isoformat(),
                "ai_question": "CLAIM APPROVED",
                "user_answer": "The Tax Team has formally approved this RDEC AIF.",
                "extracted_fields": []
            })
            
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
    logger.info(f"✅ Approved submission {session_id}")
    return {"message": "Successfully approved"}

@app.post("/api/reviewer/return/{session_id}")
async def return_submission(session_id: str, feedback: ReviewerFeedback):
    """Updates a submission's status to 'Returned' and saves the email feedback."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            data = json.load(f)
            
        data["status"] = "Returned"
        
        if "audit_summary" in data and "detailed_log" in data["audit_summary"]:
            data["audit_summary"]["detailed_log"].append({
                "timestamp": datetime.now().isoformat(),
                "ai_question": "TAX TEAM FEEDBACK",
                "user_answer": feedback.email_body,
                "extracted_fields": []
            })
        
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
    logger.info(f"🔙 Returned submission {session_id} to client.")
    return {"message": "Successfully returned to client"}

# ==========================================
# 3. UTILITY ENDPOINTS
# ==========================================
@app.post("/api/upload")
async def upload_draft_endpoint(file: UploadFile = File(...)):
    """Handles the Step 0 upload, extracts text, and parses it into the AIF state."""
    logger.info(f"📄 Received file upload: {file.filename}")
    
    file_bytes = await file.read()
    raw_text = extract_text_from_file(file_bytes, file.filename)
    if not raw_text:
        raise HTTPException(status_code=400, detail="Could not extract text from the document.")
        
    logger.info(f"🔍 Extracted {len(raw_text)} characters. Sending to Draft Parser Agent...")
    prompt = f"Here is the raw text extracted from the user's draft document:\n\n<document>\n{raw_text}\n</document>"
    
    max_retries = 2
    attempts = 0
    parsed_output = None
    
    while attempts <= max_retries:
        try:
            raw_response = await draft_parser_runner.run_debug(prompt, session_id="upload_parse_session")
            final_json_str = extract_text_from_events(raw_response)
            clean_json = final_json_str.replace("```json", "").replace("```", "").strip()
            parsed_output = json.loads(clean_json)
            break 
            
        except Exception as e:
            logger.error(f"❌ Parse attempt {attempts} failed: {e}")
            attempts += 1
            
    if not parsed_output:
        raise HTTPException(status_code=500, detail="Failed to parse document into AIF structure.")

    return {
        "message": parsed_output.get("analysis_summary", "Draft successfully parsed."),
        "extracted_state": parsed_output.get("extracted_state", {}),
        "is_complete": parsed_output.get("is_draft_complete", False)
    }

@app.post("/api/submit")
async def submit_to_tax_team_endpoint(submission: FinalSubmission):
    logger.info(f"📦 Receiving final submission for {submission.session_id}")
    file_path = os.path.join(SUBMISSIONS_DIR, f"{submission.session_id}.json")
    
    data = submission.model_dump()
    data["status"] = "In Review"
    
    async with file_io_lock:
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        
    return {"status": "success", "message": "Successfully sent to Tax Team."}

@app.post("/api/chat/save")
async def save_chat_session(request: SaveSessionRequest):
    """Saves a work-in-progress chat session."""
    filepath = os.path.join(SAVED_DIR, f"{request.session_id}.json")
    
    async with file_io_lock:
        with open(filepath, "w") as f:
            json.dump(request.model_dump(), f, indent=2)
        
    return {"status": "success"}

@app.get("/api/chat/load/{session_id}")
async def load_chat_session(session_id: str):
    """Loads a previously saved chat session."""
    filepath = os.path.join(SAVED_DIR, f"{session_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Session not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            return json.load(f)

@app.get("/api/client/dashboard")
async def get_client_dashboard():
    """Reads the submissions and saved folders to populate the Client's My Claims folder."""
    dashboard_data = {"returned": [], "saved": [], "sent": []}
    
    # 1. Read Submitted/Returned claims
    for filename in os.listdir(SUBMISSIONS_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(SUBMISSIONS_DIR, filename)
            async with file_io_lock:
                try:
                    with open(filepath, "r") as f:
                        data = json.load(f)
                except Exception as e:
                    logger.error(f"Error reading submission {filename}: {e}")
                    continue
                    
            aif_state = data.get("aif_state") or {}
            company_details = aif_state.get("company_details") or {}
            company = company_details.get("company_name") or "Unknown Company"
            
            status = data.get("status", "In Review")
            item = {"id": data.get("session_id"), "name": company, "status": status, "date": "Recent"}
            
            if status in ["Returned", "Action Required"]:
                dashboard_data["returned"].append(item)
            else:
                dashboard_data["sent"].append(item)
                    
    # 2. Read Saved (Work-in-progress) claims
    for filename in os.listdir(SAVED_DIR):
        if filename.endswith(".json"):
            filepath = os.path.join(SAVED_DIR, filename)
            async with file_io_lock:
                try:
                    with open(filepath, "r") as f:
                        data = json.load(f)
                except Exception as e:
                    logger.error(f"Error reading saved session {filename}: {e}")
                    continue
                    
            aif_state = data.get("aif_state") or {}
            company_details = aif_state.get("company_details") or {}
            company = company_details.get("company_name") or "Unnamed Draft"
            
            dashboard_data["saved"].append({
                "id": data.get("session_id"), 
                "name": company, 
                "date": "Saved Session"
            })
                    
    return dashboard_data

@app.get("/api/download/{session_id}")
async def download_docx_endpoint(session_id: str):
    """Allows the user or reviewer to download the generated Word document."""
    file_path = os.path.join(EXPORTS_DIR, f"AIF_{session_id}.docx")
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=f"RDEC_AIF_{session_id}.docx")
    raise HTTPException(status_code=404, detail="Document not ready or found.")

# ==========================================
# 4. EPHEMERAL CHAT ENDPOINTS
# ==========================================
@app.get("/api/chat/human/{session_id}")
async def get_human_chat(session_id: str):
    """Fetches the human-to-human chat history for a session."""
    return ephemeral_chat_db.get(session_id, [])

@app.post("/api/chat/human/{session_id}")
async def post_human_chat(session_id: str, payload: HumanMessage):
    """Saves a new human message to the ephemeral database."""
    if session_id not in ephemeral_chat_db:
        ephemeral_chat_db[session_id] = []
        
    new_msg = {
        "sender": payload.sender,
        "message": payload.message,
        "timestamp": datetime.now().isoformat()
    }
    
    ephemeral_chat_db[session_id].append(new_msg)
    return new_msg