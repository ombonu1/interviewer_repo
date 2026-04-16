from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import json
import re
import os
from datetime import datetime

# Import paths and locks from your config file
from core.config import SAVED_DIR, SUBMISSIONS_DIR, EXPORTS_DIR, file_io_lock, logger

# Import schemas
from model_schemas import FinalSubmission

# Import utilities and agents
from agent_tools.document_tools import extract_text_from_file
from agents.draft_parser import draft_parser_runner
from utils.helpers import extract_text_from_events, generate_rdec_docx

# Create the router instance
router = APIRouter()

# ==========================================
# CLIENT ENDPOINTS
# ==========================================
# NOTE: Because this router will be mounted with prefix="/api", 
# the paths here are relative to that (e.g., "/upload" resolves to "/api/upload")

@router.post("/upload")
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

    # ENFORCE THE WEAK_DRAFT FLAG
    is_complete = parsed_output.get("is_draft_complete")
    if is_complete is False:
        extracted_state = parsed_output.get("extracted_state", {})
        if "project_narratives" in extracted_state and extracted_state["project_narratives"]:
            narrative = extracted_state["project_narratives"][0]
            
            if narrative.get("scientific_uncertainties"):
                narrative["scientific_uncertainties"] = f"[WEAK_DRAFT] {narrative['scientific_uncertainties']}"
            if narrative.get("why_unresolvable_by_professional"):
                narrative["why_unresolvable_by_professional"] = f"[WEAK_DRAFT] {narrative['why_unresolvable_by_professional']}"

    return {
        "message": parsed_output.get("analysis_summary", "Draft successfully parsed."),
        "extracted_state": parsed_output.get("extracted_state", {}),
        "is_complete": parsed_output.get("is_draft_complete", False)
    }

@router.post("/submit")
async def submit_to_tax_team_endpoint(submission: FinalSubmission):
    logger.info(f"📦 Receiving final submission for {submission.session_id}")
    file_path = os.path.join(SUBMISSIONS_DIR, f"{submission.session_id}.json")
    saved_path = os.path.join(SAVED_DIR, f"{submission.session_id}.json")
    
    data = submission.model_dump()

    # Log manual edits
    manual_edits = data.get("_meta", {}).get("manual_edits", [])
    if manual_edits:
        if "audit_summary" not in data: data["audit_summary"] = {}
        if "detailed_log" not in data["audit_summary"]: data["audit_summary"]["detailed_log"] = []
        
        for edit in manual_edits:
            data["audit_summary"]["detailed_log"].append({
                "timestamp": edit.get("timestamp", datetime.now().isoformat()),
                "actor": "Client / Engineer",
                "event_type": "Manual Document Override",
                "details": f"Directly edited the '{edit.get('field')}' field, bypassing AI."
            })
        data["_meta"]["manual_edits"] = []
    
    # 🛑 1. THE CRITICAL COMPLIANCE GUARDRAIL
    audit_log = data.get("audit_summary", {}).get("detailed_log", [])
    if not audit_log or len(audit_log) == 0:
        logger.error(f"❌ Rejected {submission.session_id}: Missing Audit Log")
        raise HTTPException(
            status_code=400, 
            detail="CRITICAL COMPLIANCE ERROR: Cannot submit AIF without an attached Interview Audit Log."
        )

    # 🛡️ 2. CHAT HISTORY PRESERVATION
    if os.path.exists(file_path):
        async with file_io_lock:
            with open(file_path, "r") as f:
                existing_data = json.load(f)
                if "human_messages" in existing_data:
                    data["human_messages"] = existing_data["human_messages"]
                if "reviewer_analysis" in existing_data:
                    data["reviewer_analysis"] = existing_data["reviewer_analysis"]

    # Update Status
    data["status"] = "In Review"
    
    # Save safely
    async with file_io_lock:
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
            
    # 🛠️ FIX 1: Cleanup the Ghost File
    # Ensure it's removed from saved_sessions so it doesn't show up twice in the dashboard
    if os.path.exists(saved_path):
        try:
            os.remove(saved_path)
            logger.info(f"🗑️ Cleaned up ghost draft file for {submission.session_id}")
        except Exception as e:
            logger.error(f"Failed to clean up ghost file {saved_path}: {e}")

    # 🛠️ FIX 2: Generate the Word Document
    # Without this, the Tax Team (and the /download endpoint) have no .docx file to fetch!
    try:
        generate_rdec_docx(data.get("aif_state", {}), submission.session_id)
        logger.info(f"📝 Word document successfully generated for {submission.session_id}")
    except Exception as e:
        logger.error(f"Failed to generate Word Doc: {e}")
        
    return {"status": "success", "message": "Successfully sent to Tax Team."}

@router.get("/client/dashboard")
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
                            # 🛠️ FIX 3: Strict Status Check (Removes the False Complete bug)
                            "is_complete": data.get("status") == "Completed"
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
                            "project_name": data.get("aif_state", {}).get("project_narratives", [{}])[0].get("project_name", "Unnamed Project"),
                            "status": data.get("status", "In Review"),
                            "is_complete": True
                        }
                        if data.get("status") == "Returned":
                            returned.append(info)
                        else:
                            sent.append(info)
                    except: continue

    return {"returned": returned, "saved": saved, "sent": sent}

@router.get("/download/{session_id}")
async def download_docx_endpoint(session_id: str):
    """Allows the user or reviewer to download the generated Word document."""
    file_path = os.path.join(EXPORTS_DIR, f"AIF_Technical_{session_id}.docx") # Make sure this matches your generate_rdec_docx filename!
    
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=f"RDEC_AIF_{session_id}.docx")
        
    raise HTTPException(status_code=404, detail="Document not ready or found.")