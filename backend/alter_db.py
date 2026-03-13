import sqlite3
import os

db_path = os.path.join(os.getenv('PROJETOS_DIR', './projetos'), 'projetos.db')
conn = sqlite3.connect(db_path)
c = conn.cursor()

def add_col(name, t, default):
    try:
        c.execute(f"ALTER TABLE metadados_cortes ADD COLUMN {name} {t} DEFAULT {default}")
        print(f"Col {name} adicionada")
    except Exception as e:
        print(f"Erro em {name}:", e)

add_col("opcoes_titulo", "TEXT", "'[]'")
add_col("opcoes_texto_capa", "TEXT", "'[]'")
add_col("texto_capa", "VARCHAR(100)", "''")

conn.commit()
conn.close()
