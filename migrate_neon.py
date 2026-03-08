from app import app, db
from sqlalchemy import text
import os

with app.app_context():
    db_uri = app.config['SQLALCHEMY_DATABASE_URI']
    print(f"Connecting to database: {db_uri}")
    
    if 'sqlite' in db_uri:
        print("WARNING: You are currently connected to your local SQLite database.")
        print("To migrate the live Vercel database, you need to add your Neon DATABASE_URL to your .env file!")
    
    with db.engine.connect() as conn:
        # Add profile_image
        try:
            conn.execute(text('ALTER TABLE personas ADD COLUMN profile_image VARCHAR(255)'))
            print("✅ Successfully added 'profile_image' column to personas table.")
        except Exception as e:
            print(f"⚠️ 'profile_image' skipped (it might already exist). Error: {e}")

        # Add raw_text
        try:
            conn.execute(text('ALTER TABLE personas ADD COLUMN raw_text TEXT'))
            print("✅ Successfully added 'raw_text' column to personas table.")
        except Exception as e:
            print(f"⚠️ 'raw_text' skipped (it might already exist). Error: {e}")

        # Add created_at
        try:
            conn.execute(text('ALTER TABLE personas ADD COLUMN created_at TIMESTAMP'))
            print("✅ Successfully added 'created_at' column to personas table.")
        except Exception as e:
            print(f"⚠️ 'created_at' skipped (it might already exist). Error: {e}")
            
        conn.commit()
        
    print("\n🚀 Migration attempt finished!")
