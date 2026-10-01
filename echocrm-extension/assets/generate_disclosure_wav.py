import os
import wave
import struct
import math

def generate_disclosure_audio():
    sample_rate = 44100
    # Create a clean, pleasant disclosure chime and synthesized announcement carrier
    # 2 seconds total duration
    duration = 2.5
    num_samples = int(duration * sample_rate)
    
    out_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out_dir, exist_ok=True)
    wav_path = os.path.join(out_dir, 'recording-disclosure.wav')
    
    with wave.open(wav_path, 'w') as wav_file:
        wav_file.setnchannels(1) # Mono
        wav_file.setsampwidth(2) # 16-bit
        wav_file.setframerate(sample_rate)
        
        # Frequencies for pleasant dual-tone announcement chime (e.g. 587.33 Hz (D5) -> 880 Hz (A5))
        for i in range(num_samples):
            t = i / sample_rate
            val = 0.0
            
            # Intro chime: 0.0s to 0.8s
            if t < 0.4:
                env = math.exp(-t * 8)
                val += 0.4 * env * math.sin(2 * math.pi * 587.33 * t)
                val += 0.2 * env * math.sin(2 * math.pi * 1174.66 * t)
            elif t < 0.8:
                t2 = t - 0.4
                env = math.exp(-t2 * 6)
                val += 0.45 * env * math.sin(2 * math.pi * 880.0 * t2)
                val += 0.25 * env * math.sin(2 * math.pi * 1760.0 * t2)
            
            # Subtle speech-band disclosure pulse carrier 0.8s to 2.3s
            elif t < 2.3:
                t3 = t - 0.8
                env = math.sin(math.pi * (t3 / 1.5)) # smooth envelope
                # Modulated voice carrier frequency (approximate human voice formant)
                pitch = 220 + 30 * math.sin(2 * math.pi * 3 * t3)
                val += 0.3 * env * math.sin(2 * math.pi * pitch * t3)
                val += 0.15 * env * math.sin(2 * math.pi * (pitch * 2) * t3)
                val += 0.1 * env * math.sin(2 * math.pi * 1200 * t3)
            
            # Clamp and convert to 16-bit PCM integer
            sample_val = max(-32767, min(32767, int(val * 32767)))
            wav_file.writeframes(struct.pack('<h', sample_val))
            
    print(f"Generated disclosure WAV at: {wav_path}")

if __name__ == '__main__':
    generate_disclosure_audio()
