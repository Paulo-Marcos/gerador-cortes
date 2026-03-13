import asyncio
import os
from google import genai

async def list_models():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    print("Listando modelos suportados:")
    try:
        models = [m async for m in getattr(client.aio.models, "list")()]
    except Exception:
        # Paginador manual se getattr(x, list) falhar 
        pass
    
    try:
        models = client.models.list()
        for m in models:
            if "image" in m.name or "generate" in m.name or "vision" in m.name:
                print(m.name)
    except Exception as e:
        print(e)

if __name__ == "__main__":
    asyncio.run(list_models())
