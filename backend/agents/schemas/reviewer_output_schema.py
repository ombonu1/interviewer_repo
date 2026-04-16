from pydantic import BaseModel, Field
from typing import Optional

class SectionFlags(BaseModel):
    competent_professional: Optional[str] = Field(None, description="Risk explanation if the lead is non-technical, or null if perfectly compliant.")
    advance: Optional[str] = Field(None, description="Risk explanation for Advance Sought, or null if perfectly compliant.")
    uncertainties: Optional[str] = Field(None, description="Risk explanation for Scientific Uncertainties, or null if perfectly compliant.")
    unresolvable: Optional[str] = Field(None, description="Risk explanation for Why Unresolvable, or null if perfectly compliant.")
    activities: Optional[str] = Field(None, description="Risk explanation for Activities, or null if perfectly compliant.")
    outcomes: Optional[str] = Field(None, description="Risk explanation for Outcomes, or null if perfectly compliant.")

class ReviewerAnalysis(BaseModel):
    confidence_score: int = Field(..., description="Score from 0-100 indicating how HMRC-ready the technical narrative is.")
    confidence_explanation: str = Field(..., description="A 1-2 sentence explanation of exactly why this score was given (e.g. 'Strong tech, but fatal flaw due to non-technical lead').")
    section_flags: SectionFlags = Field(..., description="Targeted warnings for specific narrative sections. Leave perfectly fine sections null.")
    client_email_draft: str = Field(..., description="A professional Teams/Slack draft to the engineers asking them to clarify the specific section flags you found.")