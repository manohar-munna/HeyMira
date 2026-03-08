import PyPDF2
import io
import re


def extract_text_from_pdf(file_stream):
    """Extract text content from an in-memory PDF file bytes object."""
    try:
        pdf_bytes = io.BytesIO(file_stream.read())
        reader = PyPDF2.PdfReader(pdf_bytes)
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        # Reset file pointer if needed downstream
        file_stream.seek(0)
        return text.strip()
    except Exception as e:
        print(f"PDF Extraction Error: {e}")
        return ""


def clean_whatsapp_export(text):
    """Clean WhatsApp chat export text for better analysis."""
    # Remove date/time stamps like [1/1/24, 10:00:00 AM] or 1/1/24, 10:00 AM -
    text = re.sub(r'\[\d{1,2}/\d{1,2}/\d{2,4},?\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\]', '', text)
    text = re.sub(r'\d{1,2}/\d{1,2}/\d{2,4},?\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\s*-\s*', '', text)
    
    # Remove media omitted messages
    text = re.sub(r'<Media omitted>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'image omitted', '', text, flags=re.IGNORECASE)
    text = re.sub(r'video omitted', '', text, flags=re.IGNORECASE)
    text = re.sub(r'audio omitted', '', text, flags=re.IGNORECASE)
    text = re.sub(r'sticker omitted', '', text, flags=re.IGNORECASE)
    
    # Remove system messages
    text = re.sub(r'Messages and calls are end-to-end encrypted.*', '', text)
    text = re.sub(r'.*changed the subject.*', '', text)
    text = re.sub(r'.*was added.*', '', text)
    text = re.sub(r'.*left.*', '', text)
    
    # Clean up extra whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = text.strip()
    
    return text


def extract_person_messages(text, person_name):
    """Extract messages from a specific person in chat exports."""
    lines = text.split('\n')
    person_messages = []
    
    for line in lines:
        # Check if line contains the person's name followed by a colon
        if person_name.lower() in line.lower():
            # Extract just the message part after the name
            parts = line.split(':', 1)
            if len(parts) > 1:
                msg = parts[1].strip()
                if msg and len(msg) > 1:
                    person_messages.append(msg)
    
    return '\n'.join(person_messages) if person_messages else text
