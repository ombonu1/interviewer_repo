from fastapi import APIRouter, HTTPException
import json
import re
import os
from datetime import datetime

# Import paths and locks from your config file
from core.config import SUBMISSIONS_DIR, APPROVED_DIR, file_io_lock, logger

# Import schemas
from model_schemas import ReviewerFeedback

# Import utilities and agents
from agents.reviewer_copilot import reviewer_runner
from utils.helpers import extract_text_from_events, append_to_master_log

# Create the router instance
router = APIRouter()

# ==========================================
# REVIEWER ENDPOINTS (Tax Team Flow)
# ==========================================
# NOTE: This router will be mounted with prefix="/api". 
# The endpoints match your exact original URLs.

@router.get("/submissions")
async def get_all_submissions():
    """Reads the submissions folder and returns a list of all submitted AIFs."""
    submissions = []
    
    if not os.path.exists(SUBMISSIONS_DIR):
        return []

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
            
    # 🛠️ FIX: Safely sort, defaulting to 0 if compliance_score is None
    submissions.sort(key=lambda x: x.get("compliance_score") or 0)
    return submissions


@router.get("/submissions/{session_id}")
async def get_submission_detail(session_id: str):
    """Fetches the full JSON data for a specific submission."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            return json.load(f)


@router.post("/reviewer/analyze/{session_id}")
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
    prompt = f"Please audit this RDEC AIF submission:\n\n{json.dumps(submission_data.get('aif_state',{}), indent=2)}"
    
    try:
        response = await reviewer_runner.run_debug(prompt, session_id=f"reviewer_{session_id}")
        raw_text = extract_text_from_events(response)
        
        # 🛡️ FIX: Regex to cleanly slice out the JSON block
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not match:
            raise ValueError("No JSON dictionary found in the Copilot response.")
            
        analysis = json.loads(match.group(0))
        
        submission_data["reviewer_analysis"] = analysis
        
        async with file_io_lock:
            with open(filepath, "w") as f:
                json.dump(submission_data, f, indent=2)
            
        return analysis
    except Exception as e:
        logger.error(f"Copilot failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to run Reviewer Copilot.")


@router.post("/reviewer/analyze-manual/{session_id}")
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
    
    manual_prompt = (
        f"CRITICAL HUMAN INSTRUCTION: {user_instruction}\n\n"
        f"Please re-audit the following RDEC AIF state, prioritizing the instruction above:\n"
        f"{json.dumps(submission_data.get('aif_state',{}), indent=2)}"
    )

    try:
        response = await reviewer_runner.run_debug(manual_prompt, session_id=f"manual_{session_id}")
        raw_text = extract_text_from_events(response)
        
        # 🛡️ FIX: Regex to cleanly slice out the JSON block
        match = re.search(r'\{.*\}', raw_text, re.DOTALL)
        if not match:
            raise ValueError("No JSON dictionary found in the Copilot response.")
            
        new_analysis = json.loads(match.group(0))

        submission_data["reviewer_analysis"] = new_analysis
        
        async with file_io_lock:
            with open(filepath, "w") as f:
                json.dump(submission_data, f, indent=2)

        return new_analysis
    except Exception as e:
        logger.error(f"Manual Copilot re-run failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to re-run Reviewer Copilot.")


@router.post("/reviewer/approve/{session_id}")
async def approve_submission(session_id: str):
    """Approves a submission, logs the decision, and moves it to the approved folder."""
    source_path = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    dest_path = os.path.join(APPROVED_DIR, f"{session_id}.json") 
    
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    async with file_io_lock:
        with open(source_path, "r") as f:
            data = json.load(f)
        
        data["status"] = "Approved"
        data["approved_at"] = datetime.now().isoformat()
        
        if "audit_summary" not in data: data["audit_summary"] = {}
        if "detailed_log" not in data["audit_summary"]: data["audit_summary"]["detailed_log"] = []
        
        data["audit_summary"]["detailed_log"].append({
            "timestamp": datetime.now().isoformat(),
            "actor": "Tax Team Reviewer",
            "event_type": "Decision: Approved",
            "details": "AIF locked and approved for final HMRC formatting."
        })
        
        with open(dest_path, "w") as f:
            json.dump(data, f, indent=2)
            
        # Try to clean up the queue
        try:
            os.remove(source_path)
        except Exception as e:
            logger.error(f"Could not remove original file {source_path}: {e}")

    logger.info(f"✅ Approved and locked submission {session_id}.")
    return {"message": "Success"}


@router.post("/reviewer/return/{session_id}")
async def return_submission(session_id: str, feedback: ReviewerFeedback):
    """Updates a submission's status to 'Returned' and injects context for the AI."""
    filepath = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    async with file_io_lock:
        with open(filepath, "r") as f:
            data = json.load(f)
            
        data["status"] = "Returned"

        if "aif_state" not in data: data["aif_state"] = {}
        if "_meta" not in data["aif_state"]: data["aif_state"]["_meta"] = {}
        data["aif_state"]["_meta"]["tax_feedback"] = feedback.email_body
        
        # Reset the 3-Strike Rule for the AI interviewer
        meta = data["aif_state"]["_meta"]
        for field in list(meta.keys()):
            if field not in ["tax_feedback", "manual_edits"]:
                meta[field] = 0
        
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

    # Safely append to the master log
    await append_to_master_log(
        session_id=session_id,
        actor="Tax Team Reviewer",
        event_type="Decision: Returned for Edits",
        details=f"File returned to client. Feedback: {feedback.email_body}"
    )
            
    logger.info(f"🔙 Returned submission {session_id} to client with feedback.")
    return {"status": "success", "message": "Successfully returned to client"}