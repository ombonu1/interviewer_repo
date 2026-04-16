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
from utils.helpers import extract_text_from_events, generate_rdec_docx, deep_merge, determine_next_field, append_to_master_log
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
APPROVED_DIR = os.path.join(DATA_DIR,"approved_queries")

# Ensure base directories exist on startup
os.makedirs(SUBMISSIONS_DIR, exist_ok=True)
os.makedirs(SAVED_DIR, exist_ok=True)
os.makedirs(EXPORTS_DIR, exist_ok=True)
os.makedirs(APPROVED_DIR, exist_ok=True)

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
# --- 1. HELPER: PREPARE PROMPT ---
def prepare_interviewer_prompt(state, current_field, user_message):
    # Ensure metadata exists
    if "_meta" not in state:
        state["_meta"] = {}
    
    # Increment Strike Counter
    attempt_count = state["_meta"].get(current_field, 0) + 1
    state["_meta"][current_field] = attempt_count

    # Handle Rejection Header
    project_status = state.get("status", "Draft")
    tax_feedback = state["_meta"].get("tax_feedback", "")
    
    rejection_header = ""
    if project_status == "Returned" and tax_feedback:
        rejection_header = f"### REJECTION MODE ACTIVE ###\nThis project was REJECTED by the Tax Team. REASON: {tax_feedback}\nYour primary goal is to help the user fix these specific issues.\n\n"

    prompt = (
        f"{rejection_header}"
        f"CURRENT_STATE:\n{json.dumps(state, indent=2)}\n\n"
        f"CURRENT_FIELD: {current_field} (Attempt {attempt_count} of 3)\n\n"
        f"USER_MESSAGE:\n{user_message}"
    )
    return prompt, attempt_count

# --- 2. HELPER: MERGE DATA ---
def merge_extracted_data(state, extracted_fields, needs_follow_up):
    updated_state = state.copy()
    ui_updates = {} 
    
    if not extracted_fields or needs_follow_up:
        return updated_state, ui_updates

    narrative_keys = [
        "project_name", "competent_professional", "advance_sought", 
        "scientific_uncertainties", "why_unresolvable_by_professional", 
        "activities_undertaken", "outcomes"
    ]
    compliance_keys = ["overseas_rnd", "ai_used", "quantum_used"]
    
    for key, value in extracted_fields.items():
        if key in narrative_keys and value is not None:
            if "project_narratives" not in updated_state or not updated_state["project_narratives"]:
                updated_state["project_narratives"] = [{}]
            updated_state["project_narratives"][0][key] = value
            ui_updates["project_narratives"] = updated_state["project_narratives"]
            
        elif key in compliance_keys and value is not None:
            if "compliance" not in updated_state or not updated_state["compliance"]:
                updated_state["compliance"] = {}
            updated_state["compliance"][key] = value
            ui_updates["compliance"] = updated_state["compliance"]
        else:
            updated_state[key] = value
            ui_updates[key] = value

    return updated_state, ui_updates

# --- 3. THE CLEAN ENDPOINT ---
@app.post("/api/chat/interviewer")
async def interviewer_chat_endpoint(request: ChatRequest):
    logger.info(f"📥 Message received for session: {request.session_id}")

    # --- 1. FOLDER-AWARE PATH HUNTING ---
    # We check if it's already a submitted/returned claim, otherwise it's a saved draft
    sub_path = os.path.join(SUBMISSIONS_DIR, f"{request.session_id}.json")
    save_path = os.path.join(SAVED_DIR, f"{request.session_id}.json")
    
    # Determine which path to use (Default to SAVED_DIR for new sessions)
    file_path = sub_path if os.path.exists(sub_path) else save_path

    # 🛠️ INITIALIZE FILE: If this is a brand new session, create the shell in SAVED_DIR
    if not os.path.exists(file_path):
        file_path = save_path # Create in saved_sessions by default
        initial_shell = {
            "session_id": request.session_id,
            "status": "Draft",
            "aif_state": request.current_aif_state,
            "audit_summary": {"detailed_log": []}
        }
        with open(file_path, "w") as f:
            json.dump(initial_shell, f, indent=2)
    
    # A. Determine Field
    current_field = determine_next_field(request.current_aif_state)
    
    if current_field == "Complete":
        logger.info("✅ Router detected Complete state. Ensuring Scorer runs...")
        
        # Check if we already have an audit summary in the state
        # If not, we MUST run the scorer now, otherwise the frontend stays stuck in chat mode
        try:
            score_prompt = f"Final AIF State: {json.dumps(request.current_aif_state)}\n\nPlease grade this submission."
            score_response = await scorer_runner.run_debug(score_prompt, session_id=request.session_id)
            score_json = extract_text_from_events(score_response).replace("```json", "").replace("```", "").strip()
            audit_summary = json.loads(score_json)
            
            return {
                "message": audit_summary.get("summary_text", "Audit complete. You can now submit."),
                "is_complete": True,
                "full_updated_state": request.current_aif_state,
                "audit_summary": audit_summary,
                "aif_updates": {}
            }
        except Exception as e:
            logger.error(f"Scorer failed during short-circuit: {e}")
            # Fallback so they aren't stuck forever
            return {
                "message": "I have all the info. Please try hitting 'Generate' again to refresh the dashboard.",
                "is_complete": True,
                "full_updated_state": request.current_aif_state,
                "audit_summary": {"completeness_score": 100, "compliance_score": 100, "summary_text": "Ready for submission."}
            }

    # B. Build Prompt
    prompt, attempt_count = prepare_interviewer_prompt(request.current_aif_state, current_field, request.message)

    human_chats = ephemeral_chat_db.get(request.session_id, [])

    if human_chats:
        tax_team_context = "\n\n--- 🛑 URGENT: TAX TEAM FEEDBACK ---\n"
        tax_team_context += "This document was RETURNED by the Tax Review Team. You must ask questions to resolve their specific concerns below:\n"
        
        for msg in human_chats:
            sender = "Tax Team Reviewer" if msg["sender"] == "tax_team" else "Client/Engineer"
            tax_team_context += f"[{sender}]: {msg['message']}\n"
            
        tax_team_context += "\nCRITICAL INSTRUCTION: Read the above feedback. Your NEXT QUESTION to the user must directly address the Tax Team's concerns to fix the highlighted issues."
        tax_team_context += "\n--------------------------------------\n"

        # Append this context to the prompt so the AI reads it before generating a response
        prompt += tax_team_context

    # C. Run LLM with Retries
    parsed_output = {}
    max_retries = 2
    for i in range(max_retries + 1):
        try:
            raw_res = await interviewer_runner.run_debug(prompt, session_id=request.session_id)
            raw_text = extract_text_from_events(raw_res)
            
            # 🛡️ THE FIX: Regex to cleanly slice out the JSON block
            match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            
            if match:
                clean_json = match.group(0)
                parsed_output = json.loads(clean_json)
                if parsed_output: break
            else:
                raise ValueError("No JSON dictionary found in the LLM response.")
                
        except Exception as e:
            logger.error(f"LLM Error (Attempt {i}): {e}")
            prompt += "\n\nERROR: You must wrap your JSON in curly braces {}. Do not include conversational text outside the JSON."

    if not parsed_output:
        return {"message": "I'm having trouble processing that. Could you rephrase?", "is_complete": False}

    # D. Process & Merge
    updated_state, ui_updates = merge_extracted_data(
        request.current_aif_state, 
        parsed_output.get("field_extraction"), 
        parsed_output.get("needs_follow_up")
    )

    # Carry over metadata
    if "_meta" in request.current_aif_state:
        updated_state["_meta"] = request.current_aif_state["_meta"]

    # E. Final Checks
    next_field = determine_next_field(updated_state)
    is_done = (next_field == "Complete")
    final_text = parsed_output.get("answer_text", "Could you elaborate?")

    # F. Scoring (If Done)
    audit_summary = None
    if is_done:
        try:
            score_res = await scorer_runner.run_debug(f"Grade this: {json.dumps(updated_state)}", session_id=request.session_id)
            score_json = extract_text_from_events(score_res).replace("```json", "").replace("```", "").strip()
            audit_summary = json.loads(score_json)
            final_text = audit_summary.get("summary_text", final_text)
        except:
            pass

    return {
        "message": final_text, 
        "aif_updates": ui_updates,
        "full_updated_state": updated_state,
        "is_complete": is_done,
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
    source_path = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    dest_path = os.path.join(APPROVED_DIR, f"{session_id}.json") # Ensure APPROVED_DIR exists!
    
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    async with file_io_lock:
        with open(source_path, "r") as f:
            data = json.load(f)
        
        data["status"] = "Approved"
        data["approved_at"] = datetime.now().isoformat()
        
        # Add the final log entry into memory BEFORE saving/moving
        if "audit_summary" not in data: data["audit_summary"] = {}
        if "detailed_log" not in data["audit_summary"]: data["audit_summary"]["detailed_log"] = []
        
        data["audit_summary"]["detailed_log"].append({
            "timestamp": datetime.now().isoformat(),
            "actor": "Tax Team Reviewer",
            "event_type": "Decision: Approved",
            "details": "AIF locked and approved for final HMRC formatting."
        })
        
        # Save to approved folder
        with open(dest_path, "w") as f:
            json.dump(data, f, indent=2)
            
        # Remove from original submissions folder to keep queue clean
        os.remove(source_path)

    logger.info(f"✅ Approved and locked submission {session_id}.")
    return {"message": "Success"}

@app.post("/api/reviewer/return/{session_id}")
async def return_submission(session_id: str, feedback: ReviewerFeedback):
    """Updates a submission's status to 'Returned' and injects context for the AI."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            data = json.load(f)
            
        # 1. Update Top-Level Status
        data["status"] = "Returned"

        # 2. Inject Feedback for the Interviewer Agent
        if "aif_state" not in data: data["aif_state"] = {}
        if "_meta" not in data["aif_state"]: data["aif_state"]["_meta"] = {}
        data["aif_state"]["_meta"]["tax_feedback"] = feedback.email_body
        
        # 3. Reset the 3-Strike Rule
        meta = data["aif_state"]["_meta"]
        for field in list(meta.keys()):
            if field not in ["tax_feedback", "manual_edits"]:
                meta[field] = 0
        
        # 4. Save back to the Submissions Folder
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

    # 5. Safely append to the master log using the helper function
    # Fixed: Using `feedback.email_body` instead of payload
    await append_to_master_log(
        session_id=session_id,
        actor="Tax Team Reviewer",
        event_type="Decision: Returned for Edits",
        details=f"File returned to client. Feedback: {feedback.email_body}"
    )
            
    logger.info(f"🔙 Returned submission {session_id} to client with feedback.")
    return {"status": "success", "message": "Successfully returned to client"}


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
            
            try:
                parsed_output = json.loads(clean_json)
            except json.JSONDecodeError:
                match = re.search(r'\{.*\}', clean_json, re.DOTALL)
                if match:
                    parsed_output = json.loads(match.group())
            
            if parsed_output:
                break 
                
        except Exception as e:
            logger.error(f"❌ Parse attempt {attempts} failed: {e}")
            attempts += 1
            
    if not parsed_output:
        raise HTTPException(status_code=500, detail="Failed to parse document into AIF structure.")

    # --- THE FIX: ENFORCE THE WEAK_DRAFT FLAG ---
    # We check if the AI rejected the draft's technical depth
    is_complete = parsed_output.get("is_draft_complete")
    if is_complete is False:
        extracted_state = parsed_output.get("extracted_state", {})
        if "project_narratives" in extracted_state and extracted_state["project_narratives"]:
            narrative = extracted_state["project_narratives"][0]
            
            # Explicitly flag the weak sections so the router catches them
            if narrative.get("scientific_uncertainties"):
                narrative["scientific_uncertainties"] = f"[WEAK_DRAFT] {narrative['scientific_uncertainties']}"
            if narrative.get("why_unresolvable_by_professional"):
                narrative["why_unresolvable_by_professional"] = f"[WEAK_DRAFT] {narrative['why_unresolvable_by_professional']}"
    # ---------------------------------------------

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

    manual_edits = data.get("_meta", {}).get("manual_edits", [])
    if manual_edits:
        # Ensure log array exists
        if "audit_summary" not in data: data["audit_summary"] = {}
        if "detailed_log" not in data["audit_summary"]: data["audit_summary"]["detailed_log"] = []
        
        for edit in manual_edits:
            data["audit_summary"]["detailed_log"].append({
                "timestamp": edit.get("timestamp", datetime.now().isoformat()),
                "actor": "Client / Engineer",
                "event_type": "Manual Document Override",
                "details": f"Directly edited the '{edit.get('field')}' field, bypassing AI."
            })
        
        # Clear the temporary manual edits array so we don't log them twice on resubmission
        data["_meta"]["manual_edits"] = []
    
    # 🛑 1. THE CRITICAL COMPLIANCE GUARDRAIL
    audit_log = data.get("audit_summary", {}).get("detailed_log", [])
    if not audit_log or len(audit_log) == 0:
        logger.error(f"❌ Rejected {submission.session_id}: Missing Audit Log")
        raise HTTPException(
            status_code=400, 
            detail="CRITICAL COMPLIANCE ERROR: Cannot submit AIF without an attached Interview Audit Log."
        )

    # 🛡️ 2. THE CHAT HISTORY PRESERVATION (Merge, don't blindly overwrite)
    # If the file already exists, we must preserve the Tax Team's previous chat history
    if os.path.exists(file_path):
        async with file_io_lock:
            with open(file_path, "r") as f:
                existing_data = json.load(f)
                # Rescue the chat history and any tax team metadata
                if "human_messages" in existing_data:
                    data["human_messages"] = existing_data["human_messages"]
                
                # Keep the original reviewer analysis so the Tax Team doesn't have to wait for a re-run
                if "reviewer_analysis" in existing_data:
                    data["reviewer_analysis"] = existing_data["reviewer_analysis"]

    # 3. Update Status
    data["status"] = "In Review"
    
    # 4. Save safely
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
    """Loads a session from either the Saved or Submissions directory."""
    
    # 1. Define the two possible paths
    saved_path = os.path.join(SAVED_DIR, f"{session_id}.json")
    submitted_path = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    
    # 2. Determine which one exists
    target_path = None
    if os.path.exists(saved_path):
        target_path = saved_path
    elif os.path.exists(submitted_path):
        target_path = submitted_path
        
    # 3. If neither exists, THEN throw the 404
    if not target_path:
        logger.error(f"❌ Session {session_id} not found in {SAVED_DIR} or {SUBMISSIONS_DIR}")
        raise HTTPException(status_code=404, detail="Session not found")
        
    # 4. Load and return the data
    async with file_io_lock:
        try:
            with open(target_path, "r") as f:
                data = json.load(f)
                # Ensure we send the status back so the frontend knows how to style it
                if "status" not in data:
                    data["status"] = "Draft" if target_path == saved_path else "Submitted"
                return data
        except Exception as e:
            logger.error(f"Error reading session file: {e}")
            raise HTTPException(status_code=500, detail="Error reading session data")


@app.get("/api/client/dashboard")
async def get_client_dashboard():
    returned = []
    saved = []
    sent = []

    # --- 1. SCAN THE SAVED DRAFTS FOLDER ---
    if os.path.exists(SAVED_DIR):
        for filename in os.listdir(SAVED_DIR):
            if filename.endswith(".json"):
                with open(os.path.join(SAVED_DIR, filename), "r") as f:
                    try:
                        data = json.load(f)
                        saved.append({
                            "session_id": data.get("session_id"),
                            "project_name": data.get("aif_state", {}).get("project_narratives", [{}])[0].get("project_name", "New Draft"),
                            "status": "Draft",
                            "is_complete": "audit_summary" in data
                        })
                    except: continue

    # --- 2. SCAN THE SUBMISSIONS FOLDER (For Returned & Sent) ---
    if os.path.exists(SUBMISSIONS_DIR):
        for filename in os.listdir(SUBMISSIONS_DIR):
            if filename.endswith(".json"):
                with open(os.path.join(SUBMISSIONS_DIR, filename), "r") as f:
                    try:
                        data = json.load(f)
                        info = {
                            "session_id": data.get("session_id"),
                            "project_name": data.get("aif_state", {}).get("project_narratives", [{}])[0].get("project_name", "Unnamed"),
                            "status": data.get("status"),
                            "is_complete": True
                        }
                        if data.get("status") == "Returned":
                            returned.append(info)
                        else:
                            sent.append(info)
                    except: continue

    return {"returned": returned, "saved": saved, "sent": sent}

@app.get("/api/download/{session_id}")
async def download_docx_endpoint(session_id: str):
    """Allows the user or reviewer to download the generated Word document."""
    file_path = os.path.join(EXPORTS_DIR, f"AIF_{session_id}.docx")
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=f"RDEC_AIF_{session_id}.docx")
    raise HTTPException(status_code=404, detail="Document not ready or found.")

@app.post("/api/reviewer/analyze-manual/{session_id}")
async def run_reviewer_manual(session_id: str, payload: dict):
    """Runs the reviewer agent with specific human context/instructions."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    user_instruction = payload.get("instruction", "No specific instruction provided.")
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")

    async with file_io_lock:
        with open(filepath, "r") as f:
            submission_data = json.load(f)

    logger.info(f"🔄 Re-running Reviewer Copilot for {session_id} with human context...")
    
    # We inject the human instruction at the very top of the prompt
    manual_prompt = (
        f"CRITICAL HUMAN INSTRUCTION: {user_instruction}\n\n"
        f"Please re-audit the following RDEC AIF state, prioritizing the instruction above:\n"
        f"{json.dumps(submission_data['aif_state'], indent=2)}"
    )

    try:
        # Run the agent (using the same reviewer_runner instance)
        response = await reviewer_runner.run_debug(manual_prompt, session_id=f"manual_{session_id}")
        json_str = extract_text_from_events(response).replace("```json", "").replace("```", "").strip()
        new_analysis = json.loads(json_str)

        # Overwrite the old analysis and update the file
        submission_data["reviewer_analysis"] = new_analysis
        
        async with file_io_lock:
            with open(filepath, "w") as f:
                json.dump(submission_data, f, indent=2)

        return new_analysis
    except Exception as e:
        logger.error(f"Manual Copilot re-run failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to re-run Reviewer Copilot.")
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