import sys
import os
import json
import subprocess
import warnings
warnings.filterwarnings("ignore")

import torch
import whisper

# Determine compute device (GPU RTX 5070 if available, otherwise CPU)
device = "cuda" if torch.cuda.is_available() else "cpu"
use_fp16 = (device == "cuda")

# Vocabulary primer prompt conditioning Whisper to accurately recognize Indian accents and Indian names
INDIAN_DENTAL_PROMPT = (
    "A patient is calling a dental clinic to book an appointment, check-up, or cleaning. "
    "Clinic dentists: Dr. Lindsay Wren, Helen Styles, Dr. Michael Chen. "
    "Days: Wednesday, Thursday, Friday, Saturday, Monday, Tuesday. "
    "Common caller names: Reyan, Rehan, Das, Peter, Dey, Dutta, Roy, Aarav, Vivaan, Aditya, Vihaan, Arjun, Krishna, Ishan, Shaurya, "
    "Ananya, Diya, Sanvi, Aadhya, Pari, Saanvi, Myra, Anvi, Prisha, Riya, Aarohi, Anaya, Navya, "
    "Sneha, Priya, Kavita, Pooja, Meera, Neha, Swati, Sunita, Tanvi, Shreya, Deepa, "
    "Rohan, Rahul, Rajesh, Vikram, Deepak, Amit, Suresh, Ramesh, Manoj, Gaurav, Sanjay, Alok, Nikhil, "
    "Sharma, Patel, Verma, Gupta, Singh, Kumar, Rao, Reddy, Nair, Iyer, Joshi, Mehta, Shah, "
    "Agarwal, Mishra, Bhat, Pillai, Banerjee, Mukherjee, Chatterjee, Das, Ghosh, Sen, Kapoor, Malhotra. "
    "Spelling out letters: R-E-Y-A-N, D-A-S, P-E-T-E-R, A-A-R-A-V, P-R-I-Y-A. "
    "Topics: teeth check-up, cleaning, scaling, root canal treatment, RCT, cavity, filling, crown, braces, toothache."
)

# Pre-load model into memory once at startup
print("PRELOADING_WHISPER", flush=True)
model_name = os.environ.get("WHISPER_MODEL", "small")
model = whisper.load_model(model_name, device=device)
print("WHISPER_READY", flush=True)

# Process requests continuously from stdin
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    if line == "PING":
        print("PONG", flush=True)
        continue
    try:
        data = json.loads(line)
        audio_path = data.get("path")
        if not audio_path or not os.path.exists(audio_path):
            print(json.dumps({"error": f"Audio file not found: {audio_path}"}), flush=True)
            continue

        # Pre-process audio to 16kHz mono WAV via ffmpeg
        wav_path = os.path.splitext(audio_path)[0] + ".wav"
        use_wav = False
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", "-f", "wav", wav_path],
                check=True, capture_output=True,
            )
            use_wav = True
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

        transcribe_path = wav_path if use_wav else audio_path

        result = model.transcribe(
            transcribe_path,
            fp16=use_fp16,
            language="en",
            initial_prompt=INDIAN_DENTAL_PROMPT,
            temperature=0.0,
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            logprob_threshold=-1.0,
        )
        transcription = result.get("text", "").strip()
        print(json.dumps({"text": transcription, "language": result.get("language", "en")}), flush=True)

        # Clean up temp files
        try:
            os.remove(audio_path)
        except OSError:
            pass
        if use_wav:
            try:
                os.remove(wav_path)
            except OSError:
                pass
    except Exception as err:
        print(json.dumps({"error": str(err)}), flush=True)
