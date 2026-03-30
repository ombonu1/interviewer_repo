import io
import PyPDF2
from docx import Document

def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extracts raw text from PDF or DOCX files."""
    text = ""
    try:
        if filename.lower().endswith('.pdf'):
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                text += page.extract_text() + "\n"
                
        elif filename.lower().endswith('.docx'):
            doc = Document(io.BytesIO(file_bytes))
            for para in doc.paragraphs:
                text += para.text + "\n"
        else:
            raise ValueError("Unsupported file type. Please upload a PDF or DOCX.")
            
    except Exception as e:
        print(f"Error extracting text from {filename}: {e}")
        return ""
        
    return text.strip()