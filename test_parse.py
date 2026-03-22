import re

text = """27/02/2026, 3:52 pm - Sanjay Eddy: Ga chepthe
27/02/2026, 3:52 pm - Sanjay Eddy: Salu
27/02/2026, 3:53 pm - Sanjay Eddy: Okarke madhyala tables unnai ga ada ochi kusuntaru adiki poi cheppali
27/02/2026, 3:53 pm - Aishwarya: Haa
27/02/2026, 3:53 pm - Aishwarya: One sec
27/02/2026, 3:53 pm - Sanjay Eddy: Ha
27/02/2026, 3:53 pm - Sanjay Eddy: Over one sec <This message was edited>
27/02/2026, 4:00 pm - Aishwarya: Came like this with date and : then the actual msg of the person"""

def parse_whatsapp(text):
    participants = set()
    
    # Let's match typical WhatsApp structures
    # Structure 1 (Android): DD/MM/YY, HH:MM am/pm - Name: Message
    # Structure 2 (iOS): [DD/MM/YY, HH:MM:SS AM] Name: Message
    
    # General regex for extracting names based on the colon separator after a potential timestamp
    lines = text.split('\n')
    for line in lines:
        # Match a prefix that looks like a timestamp (either Android or iOS)
        # ^\[?          : optional open bracket
        # \d{1,2}[/-]\d{1,2}[/-]\d{2,4} : date
        # [,\s]+        : comma and/or spaces
        # \d{1,2}:\d{2}(:\d{2})? : time
        # [\s\u202f]?[a-zA-Z]{0,2} : optional space and am/pm
        # \]?\s*[-]*\s* : optional close bracket, optional dash, spaces
        # (.*?):\s*     : name capturing group, followed by colon and spaces
        
        match = re.match(r'^\[?\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}[,\s]+\d{1,2}:\d{2}(?::\d{2})?[\s\u202f]*[a-zA-Z]{0,2}\]?\s*[\-]?\s*(.*?):\s*(.*)', line)
        if match:
            name = match.group(1).strip()
            # Ignore common system messages that aren't actual names
            if not re.search(r'(messages and calls|changed the subject|left|added|security code)', name, re.IGNORECASE):
                participants.add(name)
            
    return list(participants)

print(parse_whatsapp(text))