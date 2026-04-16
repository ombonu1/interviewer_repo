from typing import Optional, Dict, Any
from typing_extensions import TypedDict

# If you still need RdecAifData elsewhere in the file, keep that import!
# from model_schemas import RdecAifData

class InterviewerResponse(TypedDict):
    current_field_answered: bool
    needs_follow_up: bool
    follow_up_reason: Optional[str]
    field_extraction: Optional[Dict[str, Any]]
    answer_text: str
    next_field: Optional[str]
    is_complete: bool