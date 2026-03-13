import os
import asyncio
from google import genai
from google.genai import types

async def test_gen():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    print("Enviando request async para imagen-4.0-generate-001...")
    try:
        result = await client.aio.models.generate_images(
            model='imagen-4.0-generate-001',
            prompt='A futuristic city in the clouds',
            config=types.GenerateImagesConfig(
                number_of_images=1,
                output_mime_type="image/jpeg",
                aspect_ratio="16:9"
            )
        )
        print("SUCESSO")
        if result.generated_images:
            print(f"Recebeu {len(result.generated_images[0].image.image_bytes)} bytes")
    except Exception as e:
        print(f"FALHOU: {e}")

if __name__ == "__main__":
    asyncio.run(test_gen())
