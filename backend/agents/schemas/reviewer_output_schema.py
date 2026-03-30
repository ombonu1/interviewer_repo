from pydantic import BaseModel, Field
from typing import List


class ReviewerAnalysis(BaseModel):
    confidence_score: int = Field(..., description="Score from 0-100 indicating how HMRC-ready the claim is.")
    red_flags: List[str] = Field(..., description="List of contradictions, missing technical justifications, or financial mismatches.")
    positive_notes: List[str] = Field(..., description="What the client did well in the AIF (e.g., strong uncertainties).")
    client_email_draft: str = Field(..., description="A professional email draft to the client asking them to clarify the specific red flags you found.")