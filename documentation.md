# HeyMira - Project Requirements and Documentation

## 1. Overview
HeyMira is a mental health support platform that leverages AI to provide personalized companionship and therapist-supervised monitoring. It allows users to chat with AI personas (derived from their own uploaded documents) while ensuring safety through mood tracking and crisis detection, with a dedicated dashboard for healthcare professionals (Doctors).

---

## 2. System Architecture

### 2.1 Backend Stack
- **Framework**: Flask (Python 3.10+)
- **Database**: SQLite (Development) / PostgreSQL (Production) with SQLAlchemy ORM
- **Authentication**: Flask-Login with password hashing (bcrypt via Werkzeug)
- **AI Integration**: Google Gemini API (via `google-generativeai`) for chat and analysis.
- **File Handling**: `PyPDF2` for document processing and `Werkzeug` for secure uploads.

### 2.2 Frontend Stack
- **Structure**: Semantic HTML5 Templates (Jinja2)
- **Styling**: Vanilla CSS3 with Modern Aesthetics (Glassmorphism, CSS Variables, Theme Support)
- **Interactivity**: Vanilla JavaScript (AJAX/Fetch API) for dynamic updates.
- **Real-time**: Server-Sent Events (SSE) for instant notifications.

---

## 3. Core Features Implementation

### 3.1 Authentication (Auth)
- **Roles**: Distinct roles for `patient` and `doctor`.
- **Flow**:
  - **Register**: Users choose a role, provide credentials, and passwords are hashed before storage.
  - **Login**: `Flask-Login` manages persistent sessions using secure cookies.
  - **Security**: `@login_required` decorators protect sensitive routes; `@doctor_required` handles role-based access control.
- **Themes**: Users can personalize their experience with theme settings stored in their profile.

### 3.2 Chatting System
- **Conversation Management**: Multiple themed sessions per user.
- **AI Logic**: 
  - Messages are sent via a POST API.
  - The system retrieves conversation history to provide context to the AI.
  - Uses the **Gemini API** to generate responses based on selected **Personas**.
- **Contextual Awareness**: The AI "remembers" previous exchanges within the same conversation session.

### 3.3 Persona Creation & Uploads
- **Document Processing**:
  - Users can upload **PDFs** (e.g., WhatsApp chat exports, journals).
  - The system extracts text using `PyPDF2`, cleans it, and identifies specific speaking patterns.
  - **AI Analysis**: Gemini analyzes the text to define personality traits, common phrases, and tone.
- **Media Uploads**: 
  - Patients can upload profile images.
  - Created personas can have custom avatars.
  - Files are stored securely in `static/uploads/` with unique, sanitized filenames.

### 3.4 Server-Sent Events (SSE)
- **Mechanism**: A persistent HTTP connection (`text/event-stream`) maintained by a background thread in Flask.
- **Use Cases**:
  - **Connection Requests**: Doctors get instant alerts when a patient accepts a connection.
  - **Emergency Alerts**: Patients receive immediate feedback if a system-level event occurs.
  - **Live Notifications**: Real-time tray updates without page refreshes.

### 3.5 Monitoring & Crisis Detection
- **Sentiment Analysis**: Every user message is analyzed for sentiment (positive/negative/neutral).
- **Crisis Detection**: A semantic filter checks for keywords or patterns indicating self-harm or severe distress.
- **Alert System**: If a crisis is detected, an `Alert` is created in the DB and the patient's assigned doctor (if any) is notified in real-time via SSE.

### 3.6 Reports & Analytics
- **Session Reports**: Generated automatically when a conversation ends.
- **Doctor Dashboard**:
  - **Patient Overview**: List of connected patients with their latest mood status.
  - **Trend Analysis**: Visual graphs showing sentiment score changes over time.
  - **Risk Assessment**: Distribution of risk levels (Low, Moderate, High, Critical) across the patient base.
  - **Full History**: Doctors can review transcriptions of conversations for patients who have granted access.

---

## 4. UI/UX and Styles
- **Modern Aesthetic**: High-end "Apple-like" design with rounded corners, subtle shadows, and blurred backgrounds (glassmorphism).
- **Theme Engine**: Support for multiple color palettes:
  - `Calm Night` (Dark Mode)
  - `Warm Sunset`
  - `Ocean Breeze`
  - `Blossom`
  - `Forest`
- **Responsive Design**: Fully functional on Mobile, Tablet, and Desktop.
- **Micro-animations**: Smooth transitions for modals, fading alerts, and chat bubble appearing effects.

---

## 5. Deployment Requirements
- **Environment Variables**: Requires `.env` for `SECRET_KEY`, `GOOGLE_API_KEY`, and `DATABASE_URL`.
- **Workers**: Should be run with a multi-threaded or asynchronous worker (like Gunicorn with `threads` or `gevent`) to support SSE connections.
- **Storage**: `UPLOAD_FOLDER` must have write permissions for the web server process.
