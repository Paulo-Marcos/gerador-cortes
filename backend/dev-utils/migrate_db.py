import os
import sqlite3

db_path = os.getenv("PROJETOS_DIR", "./projetos") + "/projetos.db"
print(f"Abrindo banco: {db_path}")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute("PRAGMA table_info(projetos)")
proj_cols = [r[1] for r in cur.fetchall()]
cur.execute("PRAGMA table_info(cortes)")
cortes_cols = [r[1] for r in cur.fetchall()]

migrations = []

if "filtro_padrao" not in proj_cols:
    cur.execute("ALTER TABLE projetos ADD COLUMN filtro_padrao TEXT DEFAULT 'nenhum'")
    migrations.append("projetos.filtro_padrao")

if "youtube_video_id" not in cortes_cols:
    cur.execute("ALTER TABLE cortes ADD COLUMN youtube_video_id TEXT DEFAULT ''")
    migrations.append("cortes.youtube_video_id")

if "youtube_url_publicado" not in cortes_cols:
    cur.execute("ALTER TABLE cortes ADD COLUMN youtube_url_publicado TEXT DEFAULT ''")
    migrations.append("cortes.youtube_url_publicado")

if "youtube_scheduled_at" not in cortes_cols:
    cur.execute("ALTER TABLE cortes ADD COLUMN youtube_scheduled_at TEXT DEFAULT ''")
    migrations.append("cortes.youtube_scheduled_at")

conn.commit()
conn.close()

if migrations:
    print("Migracoes aplicadas:", ", ".join(migrations))
else:
    print("Nenhuma migracao necessaria - colunas ja existem")
