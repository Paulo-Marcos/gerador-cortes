import sqlite3
import os

db_path = 'backend/projetos/projetos.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
projeto_id = '0f06a5ee-75ae-4036-96bf-6d3c43417d8c'
cursor.execute("SELECT id, numero, status, is_pos_producao FROM cortes WHERE projeto_id = ?", (projeto_id,))
rows = cursor.fetchall()
for r in rows:
    print(r)
conn.close()
