import sqlite3
import os

db_path = os.path.join('instance', 'heymira.db')
if not os.path.exists(db_path):
    db_path = 'heymira.db'

print(f"Connecting to database at: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Try adding the profile_image column to personas if it doesn't exist
    try:
        cursor.execute('ALTER TABLE personas ADD COLUMN profile_image VARCHAR(255)')
        print("Successfully added profile_image column to personas table.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column profile_image already exists in personas table.")
        else:
            print(f"Error adding profile_image: {e}")

    conn.commit()
    print("Database migration completed.")
except Exception as e:
    print(f"Failed to connect or migrate: {e}")
finally:
    if 'conn' in locals():
        conn.close()
