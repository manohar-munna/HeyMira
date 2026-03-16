# 🌙 HeyMira - AI-Powered Mental Health Companion

HeyMira is a sophisticated mental health support platform that leverages the power of generative AI to provide personalized companionship and therapist-supervised monitoring. By analyzing user-uploaded documents and real-time conversations, HeyMira creates empathetic AI personas that offer a safe space for reflection while ensuring user safety through advanced crisis detection systems.

---

## 🚀 Key Features

### 🤖 AI Personas & Companionship
- **Document-Driven Personas**: Upload PDFs (journals, chat exports) to create AI companions that mirror specific speaking patterns and tones.
- **Deep Contextual Memory**: Conversations that feel natural and remember previous exchanges.
- **Sentiment Analysis**: Real-time mood tracking for every message.

### 🏥 Healthcare Professional (Doctor) Dashboard
- **Patient Monitoring**: A dedicated dashboard for doctors to track patient mood trends and risk levels.
- **Crisis Detection**: Automated semantic filtering to detect patterns of distress or self-harm.
- **Real-time Alerts**: Instant notifications via Server-Sent Events (SSE) when a crisis is detected.
- **Risk Assessment**: Categorized risk levels (Low, Moderate, High, Critical) for efficient triage.

### 🎨 Premium User Experience
- **Modern UI**: A sleek, "Apple-like" aesthetic featuring glassmorphism and smooth micro-animations.
- **Theme Engine**: Five curated color palettes (Calm Night, Warm Sunset, Ocean Breeze, Blossom, Forest).
- **Responsive Design**: Seamless experience across Mobile, Tablet, and Desktop.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, Flask
- **Database**: SQLAlchemy (SQLite for development, PostgreSQL for production)
- **AI Engine**: Google Gemini API
- **Real-time**: Server-Sent Events (SSE)
- **Frontend**: Vanilla JS, Jinja2 Templates, Modern CSS3
- **Security**: Flask-Login, Bcrypt hashing, Secure File Uploads

---

## ⚙️ Setup & Installation

### 1. Prerequisites
- Python 3.10+
- A Google Gemini API Key

### 2. Clone the Repository
```bash
git clone https://github.com/yourusername/HeyMira.git
cd HeyMira
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Environment Variables
Create a `.env` file in the root directory and add the following:
```env
SECRET_KEY=your_secret_key_here
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:///heymira.db  # Use PostgreSQL for production
```

### 5. Initialize the Database & Run
```bash
python app.py
```
The application will be available at `http://localhost:5000`.

---

## 📂 Project Structure

- `/models`: Database schemas and SQLAlchemy models.
- `/routes`: Flask blueprints for auth, chat, personas, and dashboards.
- `/services`: Core logic for AI analysis, SSE, and document processing.
- `/static`: CSS, JavaScript, and uploaded assets.
- `/templates`: Jinja2 HTML templates.
- `app.py`: Main application entry point.

---

## 📝 Documentation
For a detailed breakdown of the system architecture and implementation details, please refer to [documentation.md](./documentation.md).

---