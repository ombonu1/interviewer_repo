from pydantic import BaseModel, Field
from model_schemas import RdecAifData

class DraftParserResponse(BaseModel):
    analysis_summary: str = Field(..., description="Summary of what was extracted.")
    extracted_state: RdecAifData = Field(..., description="The extracted data mapped to the schema.")
    is_draft_complete: bool = Field(
        default=False, 
        description="Set to true ONLY if Sections A through E are 100% complete, fully detailed, and require absolutely no further questioning."
    )