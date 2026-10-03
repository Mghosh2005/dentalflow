import sys
import os
import asyncio
import edge_tts

if sys.platform == 'win32':
    try:
        import msvcrt
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    except Exception:
        pass

async def generate_speech(text: str, voice: str = "en-IN-NeerjaExpressiveNeural"):
    try:
        communicate = edge_tts.Communicate(text, voice, rate="+0%", pitch="+0Hz")
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                sys.stdout.buffer.write(chunk["data"])
                sys.stdout.buffer.flush()
    except Exception as e:
        sys.stderr.write(f"EdgeTTS Error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python edge_tts_service.py <text> [voice]\n")
        sys.exit(1)

    text = sys.argv[1]
    voice = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else "en-IN-NeerjaExpressiveNeural"
    asyncio.run(generate_speech(text, voice))
