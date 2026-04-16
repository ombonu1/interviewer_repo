from typing_extensions import TypedDict
from typing import List, Optional

class ProjectNarrative(TypedDict):
    project_name: Optional[str]
    competent_professional: Optional[str]
    advance_sought: Optional[str]
    scientific_uncertainties: Optional[str]
    why_unresolvable_by_professional: Optional[str]
    activities_undertaken: Optional[str]
    outcomes: Optional[str]

class Compliance(TypedDict):
    overseas_rnd: Optional[bool]
    ai_used: Optional[bool]
    quantum_used: Optional[bool]

class ExtractedState(TypedDict):
    project_narratives: List[ProjectNarrative]
    compliance: Compliance

class DraftParserResponse(TypedDict):
    extracted_state: ExtractedState
    evaluation_reasoning: str
    is_draft_complete: bool
    analysis_summary: str