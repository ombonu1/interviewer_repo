from pydantic import BaseModel, Field
from typing import List

class AuditEntry(BaseModel):
    timestamp: str
    ai_question: str
    user_answer: str
    extracted_fields: List[str] = []

class AuditSummary(BaseModel):
    completeness_score: int = Field(..., description="Score from 0-100 based on how many required RDEC fields are filled.")
    compliance_score: int = Field(..., description="Score from 0-100 based on the technical strength and HMRC eligibility of the narratives.")
    summary_text: str = Field(..., description="A 2-3 sentence summary of the interview for the user.")
    tax_team_flags: List[str] = Field(..., description="Specific warnings or notes for the tax team (e.g., 'Software costs seem unusually high without justification').")
    detailed_log: List[AuditEntry] = Field(default_factory=list)