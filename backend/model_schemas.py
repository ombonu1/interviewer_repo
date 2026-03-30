from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from agents.schemas.scorer_output_schema import AuditSummary

# --- RDEC AIF NESTED MODELS ---

class CompanyDetails(BaseModel):
    company_name: Optional[str] = None
    utr: Optional[str] = None
    accounting_period: Optional[str] = None
    competent_professional_details: Optional[str] = None
    rdec_eligibility_reason: Optional[str] = None
    first_time_claimant: Optional[bool] = None

class ProjectSummary(BaseModel):
    total_projects: Optional[int] = None
    projects_to_describe: Optional[int] = None
    qualifying_expenditure_percentage: Optional[float] = None
    selection_reason: Optional[str] = None

class FinancialBreakdown(BaseModel):
    staff_costs: Optional[float] = None
    epw_costs: Optional[float] = None
    subcontractor_costs: Optional[float] = None
    consumables: Optional[float] = None
    software: Optional[float] = None
    cloud_computing: Optional[float] = None
    prototyping: Optional[float] = None
    other_rdec_categories: Optional[float] = None

class ProjectNarrative(BaseModel):
    project_name: Optional[str] = None
    advance_sought: Optional[str] = None
    scientific_uncertainties: Optional[str] = None
    why_unresolvable_by_professional: Optional[str] = None
    activities_undertaken: Optional[str] = None
    outcomes_and_failures: Optional[str] = None
    project_costs: Optional[float] = None

class ComplianceQuestions(BaseModel):
    overseas_rd: Optional[bool] = None
    overseas_subcontractors: Optional[bool] = None
    overseas_epws: Optional[bool] = None
    ai_used: Optional[bool] = None
    mathematics_central: Optional[bool] = None
    quantum_technologies: Optional[bool] = None
    rd_at_company_address: Optional[bool] = None
    professional_adviser_involved: Optional[bool] = None
    senior_officer_approval: Optional[bool] = None

# --- MAIN STATE MODEL ---

class RdecAifData(BaseModel):
    """The master state object the agent is trying to complete"""
    company_details: CompanyDetails = Field(default_factory=CompanyDetails)
    project_summary: ProjectSummary = Field(default_factory=ProjectSummary)
    financials: FinancialBreakdown = Field(default_factory=FinancialBreakdown)
    project_narratives: List[ProjectNarrative] = Field(default_factory=list)
    compliance: ComplianceQuestions = Field(default_factory=ComplianceQuestions)

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_aif_session"
    history: Optional[List[Dict[str, Any]]] = []
    current_aif_state: Optional[Dict[str, Any]] = Field(default_factory=dict)

class FinalSubmission(BaseModel):
    session_id: str
    aif_state: dict
    audit_summary: AuditSummary

class ReviewerFeedback(BaseModel):
    email_body: str

class SaveSessionRequest(BaseModel):
    session_id: str
    aif_state: Dict[str, Any]
    messages: List[Dict[str, str]]
    audit_log: List[Dict[str, Any]]

class HumanMessage(BaseModel):
    sender: str
    message: str