from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from model_schemas import RdecAifData

class InterviewerResponse(BaseModel):
    current_field_answered: bool
    needs_follow_up: bool
    follow_up_reason: str
    field_extraction: Dict[str, Any]
    next_field: str
    answer_text: str
    analysis_summary: str
    is_complete: bool