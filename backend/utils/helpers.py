import os
from docx import Document
from docx.shared import Pt, Inches
from datetime import datetime
from google.adk.sessions import InMemorySessionService
from google.adk.runners import Runner 

# ==========================================
# 1. GOOGLE ADK UTILITIES
# ==========================================

def _make_runner(agent):
    return Runner(agent=agent, app_name="askFINN", session_service=InMemorySessionService())

def extract_text_from_events(events):
    """
    Robustly extracts the final text response from a list of Agent events.
    Handles 'content.parts', 'parts', and 'output' attributes.
    """
    final_text = ""
    
    print(f"🔍 DEBUG: Scanning {len(events)} events for output...")

    for i, event in enumerate(events):
        # 1. Check for 'content.parts' (The structure seen in your logs)
        if hasattr(event, "content") and hasattr(event.content, "parts"):
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    final_text = part.text
        
        # 2. Check for direct '.parts' (Older Google GenAI structure)
        elif hasattr(event, "parts"):
            for part in event.parts:
                if hasattr(part, "text") and part.text:
                    final_text = part.text

        # 3. Check standard '.text'
        elif hasattr(event, "text") and event.text:
            final_text = event.text
            
        # 4. Check for Tool Output (e.g. Chart JSON directly in event)
        elif hasattr(event, "output") and event.output:
            final_text = str(event.output)

    # Decision Time
    if final_text:
        print(f"✅ Found Output: {final_text[:100]}...") 
        return final_text


# ==========================================
# 2. DOCUMENT GENERATOR (The Payoff!)
# ==========================================

def generate_rdec_docx(aif_state: dict, session_id: str):
    """
    Takes the completed AIF JSON state and compiles a formatted Word document.
    """
    print(f"📝 Generating RDEC Word Document for session {session_id}...")
    
    doc = Document()
    
    # --- Title ---
    title = doc.add_heading('RDEC Additional Information Form (AIF)', 0)
    title.alignment = 1 # Center align
    doc.add_paragraph(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n").alignment = 1

    # --- Section A: Company Details ---
    doc.add_heading('A. Company & Claim Details', level=1)
    company = aif_state.get('company_details', {})
    doc.add_paragraph(f"Company Name: {company.get('company_name', 'Not Provided')}")
    doc.add_paragraph(f"UTR: {company.get('utr', 'Not Provided')}")
    doc.add_paragraph(f"Accounting Period: {company.get('accounting_period', 'Not Provided')}")
    doc.add_paragraph(f"Competent Professional: {company.get('competent_professional_details', 'Not Provided')}")
    doc.add_paragraph(f"RDEC Eligibility Reason: {company.get('rdec_eligibility_reason', 'Not Provided')}")
    doc.add_paragraph(f"First-Time Claimant: {'Yes' if company.get('first_time_claimant') else 'No'}")

    # --- Section B: Project Summary ---
    doc.add_heading('B. Project Summary', level=1)
    summary = aif_state.get('project_summary', {})
    doc.add_paragraph(f"Total Projects: {summary.get('total_projects', 0)}")
    doc.add_paragraph(f"Projects Described in this AIF: {summary.get('projects_to_describe', 0)}")
    doc.add_paragraph(f"Qualifying Expenditure Covered: {summary.get('qualifying_expenditure_percentage', 0)}%")
    doc.add_paragraph(f"Selection Reason:\n{summary.get('selection_reason', 'Not Provided')}")

    # --- Section C: Financials ---
    doc.add_heading('C. Scheme-Level Financial Breakdown', level=1)
    fin = aif_state.get('financials', {})
    table = doc.add_table(rows=1, cols=2)
    table.style = 'Table Grid'
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = 'Category'
    hdr_cells[1].text = 'Cost (£)'
    
    categories = [
        ('Staff Costs', 'staff_costs'), ('EPWs', 'epw_costs'), 
        ('Subcontractors', 'subcontractor_costs'), ('Consumables', 'consumables'),
        ('Software', 'software'), ('Cloud Computing', 'cloud_computing'),
        ('Prototyping', 'prototyping'), ('Other RDEC Categories', 'other_rdec_categories')
    ]
    
    for label, key in categories:
        row_cells = table.add_row().cells
        row_cells[0].text = label
        row_cells[1].text = f"£ {fin.get(key, 0):,.2f}" if fin.get(key) else "£ 0.00"

    # --- Section D: Project Narratives ---
    doc.add_heading('D. Project Narratives', level=1)
    narratives = aif_state.get('project_narratives', [])
    
    if not narratives:
        doc.add_paragraph("No specific project narratives provided.")
    else:
        for idx, proj in enumerate(narratives, 1):
            doc.add_heading(f"Project {idx}: {proj.get('project_name', 'Unnamed Project')}", level=2)
            doc.add_paragraph(f"Advance Sought:\n{proj.get('advance_sought', 'Not Provided')}")
            doc.add_paragraph(f"Scientific/Technological Uncertainties:\n{proj.get('scientific_uncertainties', 'Not Provided')}")
            doc.add_paragraph(f"Why uncertainties could not be resolved by a competent professional:\n{proj.get('why_unresolvable_by_professional', 'Not Provided')}")
            doc.add_paragraph(f"Activities Undertaken:\n{proj.get('activities_undertaken', 'Not Provided')}")
            doc.add_paragraph(f"Outcomes & Failures:\n{proj.get('outcomes_and_failures', 'Not Provided')}")
            doc.add_paragraph(f"Project Level Costs: £ {proj.get('project_costs', 0):,.2f}")

    # --- Section E: Compliance ---
    doc.add_heading('E. Mandatory Compliance Questions', level=1)
    comp = aif_state.get('compliance', {})
    
    def yes_no(val):
        if val is None: return "Not Answered"
        return "Yes" if val else "No"

    doc.add_paragraph(f"Overseas R&D? {yes_no(comp.get('overseas_rd'))}")
    doc.add_paragraph(f"Overseas Subcontractors? {yes_no(comp.get('overseas_subcontractors'))}")
    doc.add_paragraph(f"Overseas EPWs? {yes_no(comp.get('overseas_epws'))}")
    doc.add_paragraph(f"AI Used? {yes_no(comp.get('ai_used'))}")
    doc.add_paragraph(f"Mathematics Central? {yes_no(comp.get('mathematics_central'))}")
    doc.add_paragraph(f"Quantum Technologies? {yes_no(comp.get('quantum_technologies'))}")
    doc.add_paragraph(f"R&D performed at company address? {yes_no(comp.get('rd_at_company_address'))}")
    doc.add_paragraph(f"Professional Adviser Involved? {yes_no(comp.get('professional_adviser_involved'))}")
    doc.add_paragraph(f"Senior Officer Approval? {yes_no(comp.get('senior_officer_approval'))}")

    # --- Save the Document ---
    export_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'exports')
    os.makedirs(export_dir, exist_ok=True)
    
    file_path = os.path.join(export_dir, f"AIF_{session_id}.docx")
    doc.save(file_path)
    print(f"✅ Document saved successfully to {file_path}")
    
    return file_path

def deep_merge(dict1, dict2):
    """Recursively merges dict2 into dict1 without dropping existing keys."""
    for key, value in dict2.items():
        if isinstance(value, dict) and key in dict1 and isinstance(dict1[key], dict):
            deep_merge(dict1[key], value)
        else:
            dict1[key] = value
    return dict1