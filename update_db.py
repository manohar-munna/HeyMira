import sqlite3
import os

# Check standard possible locations for the SQLite database
db_path = os.path.join('instance', 'heymira.db')
if not os.path.exists(db_path):
    db_path = 'heymira.db'

print(f"Connecting to database at: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Try adding each column, catch errors if they already exist
    columns_to_add = [
        ("age", "INTEGER"),
        ("gender", "VARCHAR(20)"),
        ("profile_image", "VARCHAR(255)")
    ]

    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f'ALTER TABLE users ADD COLUMN {col_name} {col_type}')
            print(f"Successfully added column: {col_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column {col_name} already exists.")
            else:
                print(f"Error adding {col_name}: {e}")

    conn.commit()
    print("Database migration completed.")
except Exception as e:
    print(f"Failed to connect or migrate: {e}")
finally:
    if 'conn' in locals():
        conn.close()
