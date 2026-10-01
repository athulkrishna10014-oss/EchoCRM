import win32com.client
import os

def generate_tts_wav():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out_dir, exist_ok=True)
    wav_path = os.path.join(out_dir, 'recording-disclosure.wav')

    # Use SAPI.SpVoice or win32com / System.Speech
    try:
        import comtypes.client
        speaker = comtypes.client.CreateObject("SAPI.SpVoice")
        stream = comtypes.client.CreateObject("SAPI.SpFileStream")
        # SSFMCreateForWrite = 3
        stream.Open(wav_path, 3)
        speaker.AudioOutputStream = stream
        speaker.Speak("This call is being recorded for quality and training purposes.")
        stream.Close()
        print(f"Generated SAPI TTS WAV at: {wav_path}")
    except Exception as e:
        print(f"comtypes failed: {e}, falling back to PowerShell script")
        import subprocess
        ps_cmd = f"""
        Add-Type -AssemblyName System.Speech
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
        $synth.SetOutputToWaveFile('{wav_path}')
        $synth.Speak('This call is being recorded for quality and training purposes.')
        $synth.Dispose()
        """
        subprocess.run(["powershell", "-Command", ps_cmd], check=True)
        print(f"Generated System.Speech TTS WAV at: {wav_path}")

if __name__ == '__main__':
    generate_tts_wav()
