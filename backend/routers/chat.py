from fastapi import APIRouter, HTTPException
import json
import re
import os
import logging
from datetime import datetime

# Import paths and locks from your new config file (or main.py if you haven't moved them yet)
from core.config import SAVED_DIR, SUBMISSIONS_DIR, file_io_lock, ephemeral_chat_db, logger

from model_schemas import ChatRequest, SaveSessionRequest, HumanMessage
from agents.interviewer import interviewer_runner
from agents.scorer_agent import scorer_runner
from utils.helpers import extract_text_from_events, determine_next_field, append_to_master_log

# Create the router instance
router = APIRouter()

# ==========================================
# CHAT HELPER FUNCTIONS
# ==========================================
def prepare_interviewer_prompt(state, current_field, user_message):
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
    # Standardized compliance keys aligned with AI output
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


# ==========================================
# CHAT ENDPOINTS
# ==========================================
# NOTE: Because this router will be mounted with prefix="/api/chat", 
# the path here is just "/interviewer", resolving to "/api/chat/interviewer"

@router.post("/interviewer")
async def interviewer_chat_endpoint(request: ChatRequest):
    logger.info(f"📥 Message received for session: {request.session_id}")

    # 1. FOLDER-AWARE PATH HUNTING
    sub_path = os.path.join(SUBMISSIONS_DIR, f"{request.session_id}.json")
    save_path = os.path.join(SAVED_DIR, f"{request.session_id}.json")
    file_path = sub_path if os.path.exists(sub_path) else save_path
    
    # 2. DETERMINE NEXT FIELD
    current_field = determine_next_field(request.current_aif_state)
    
    if current_field == "Complete":
        logger.info("✅ Router detected Complete state. Ensuring Scorer runs...")
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
            return {
                "message": "I have all the info. Please try hitting 'Generate' again to refresh the dashboard.",
                "is_complete": True,
                "full_updated_state": request.current_aif_state,
                "audit_summary": {"completeness_score": 100, "compliance_score": 100, "summary_text": "Ready for submission."}
            }

    # 3. BUILD PROMPT & INJECT TAX TEAM CONTEXT
    prompt, attempt_count = prepare_interviewer_prompt(request.current_aif_state, current_field, request.message)
    human_chats = ephemeral_chat_db.get(request.session_id, [])

    if human_chats:
        tax_team_context = "\n\n--- 🛑 URGENT: TAX TEAM FEEDBACK ---\n"
        tax_team_context += "This document was RETURNED by the Tax Review Team. You must ask questions to resolve their specific concerns below:\n"
        for msg in human_chats:
            sender = "Tax Team Reviewer" if msg["sender"] == "tax_team" else "Client/Engineer"
            tax_team_context += f"[{sender}]: {msg['message']}\n"
            
        tax_team_context += "\nCRITICAL INSTRUCTION: Read the above feedback. Your NEXT QUESTION to the user must directly address the Tax Team's concerns to fix the highlighted issues.\n--------------------------------------\n"
        prompt += tax_team_context

    # 4. RUN LLM WITH RETRIES & REGEX PARSING
    parsed_output = {}
    max_retries = 2
    for i in range(max_retries + 1):
        try:
            raw_res = await interviewer_runner.run_debug(prompt, session_id=request.session_id)
            raw_text = extract_text_from_events(raw_res)
            
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

    # 5. PROCESS & MERGE STATE
    updated_state, ui_updates = merge_extracted_data(
        request.current_aif_state, 
        parsed_output.get("field_extraction"), 
        parsed_output.get("needs_follow_up")
    )

    if "_meta" in request.current_aif_state:
        updated_state["_meta"] = request.current_aif_state["_meta"]

    # 6. FINAL CHECKS & LOGGING
    next_field = determine_next_field(updated_state)
    is_done = (next_field == "Complete")
    final_text = parsed_output.get("answer_text", "Could you elaborate?")

    # Safely write to master log (Requires the session file to exist)
    await append_to_master_log(
        SUB_dir=SUBMISSIONS_DIR,
        SAVED_dir=SAVED_DIR,
        session_id=request.session_id,
        actor="AI Agent",
        event_type="Interview Step",
        details=f"User: {request.message} | AI: {final_text}"
    )

    # 7. FINAL SCORING IF TRANSITIONING TO COMPLETE
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


@router.post("/save")
async def save_chat_session(request: SaveSessionRequest):
    """Saves a work-in-progress chat session."""
    from core.config import ephemeral_audit_logs # Import the buffer
    
    filepath = os.path.join(SAVED_DIR, f"{request.session_id}.json")
    data = request.model_dump()
    
    # 🛠️ FIX: Inject any waiting memory logs into the save payload!
    if request.session_id in ephemeral_audit_logs and ephemeral_audit_logs[request.session_id]:
        if "audit_summary" not in data or data["audit_summary"] is None: 
            data["audit_summary"] = {}
        if "detailed_log" not in data["audit_summary"]: 
            data["audit_summary"]["detailed_log"] = []
            
        data["audit_summary"]["detailed_log"].extend(ephemeral_audit_logs[request.session_id])
        
        # Clear the memory buffer
        ephemeral_audit_logs[request.session_id] = []
    
    async with file_io_lock:
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
            
    return {"status": "success"}


@router.get("/load/{session_id}")
async def load_chat_session(session_id: str):
    """Loads a session from either the Saved or Submissions directory."""
    saved_path = os.path.join(SAVED_DIR, f"{session_id}.json")
    submitted_path = os.path.join(SUBMISSIONS_DIR, f"{session_id}.json")
    
    target_path = None
    if os.path.exists(saved_path):
        target_path = saved_path
    elif os.path.exists(submitted_path):
        target_path = submitted_path
        
    if not target_path:
        logger.error(f"❌ Session {session_id} not found in {SAVED_DIR} or {SUBMISSIONS_DIR}")
        raise HTTPException(status_code=404, detail="Session not found")
        
    async with file_io_lock:
        try:
            with open(target_path, "r") as f:
                data = json.load(f)
                if "status" not in data:
                    data["status"] = "Draft" if target_path == saved_path else "Submitted"
                return data
        except Exception as e:
            logger.error(f"Error reading session file: {e}")
            raise HTTPException(status_code=500, detail="Error reading session data")


@router.get("/human/{session_id}")
async def get_human_chat(session_id: str):
    """Fetches the human-to-human chat history for a session."""
    return ephemeral_chat_db.get(session_id, [])


@router.post("/human/{session_id}")
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