import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

type VoiceState = 'listening' | 'processing' | 'speaking';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  @ViewChild('waveCanvas') waveCanvas!: ElementRef<HTMLCanvasElement>;
  private animationId: number = 0;

  state: VoiceState = 'listening';

  private mediaRecorder!: MediaRecorder;
  private audioChunks: Blob[] = [];
  private audioContext!: AudioContext;
  private analyser!: AnalyserNode;
  private microphoneStream!: MediaStream;

  private silenceTimer: any = null;
  private silenceThreshold = 10;      // volume threshold
  private silenceDuration = 3000;     // 3 seconds

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  async ngOnInit() {
    await this.initMicrophone();
    this.startRecording();
  }

  ngOnDestroy() {
    this.microphoneStream?.getTracks().forEach(track => track.stop());
    cancelAnimationFrame(this.animationId);
  }

  //  init mic
  async initMicrophone() {
    this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.microphoneStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);

    this.mediaRecorder = new MediaRecorder(this.microphoneStream);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = [];
      this.handleTranscription(blob);
    };
  }

  //  start recording
  startRecording() {
    this.state = 'listening';
    this.cd.detectChanges();
    
    setTimeout(() => {
      this.drawWave();
    });

    this.mediaRecorder.start();
    // this.detectSilence();
  }


  private drawWave() {
    const canvas = this.waveCanvas.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const dpr = window.devicePixelRatio || 1;
    const size = 200;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.scale(dpr, dpr);

    const analyser = this.analyser;
    analyser.fftSize = 2048;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let time = 0;

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, size, size);

      const centerY = size / 2;

      // get averge volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const volume = sum / bufferLength / 255;

      drawLayer(1.6, 3, 10.3, 'rgba(0,255,255,0.7)');
      drawLayer(1.4, 4, 10.6, 'rgba(255,0,255,0.5)');
      drawLayer(1.3, 5, 11, 'rgba(0,150,255,0.9)');

      time += 0.02;

      function drawLayer(amplitudeFactor: number, frequency: number, speed: number, color: string) {
        ctx.beginPath();
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.shadowBlur = 20;
        ctx.shadowColor = color;

        for (let x = 0; x <= size; x++) {
          const progress = x / size;
          const wave =
            Math.sin(progress * frequency * Math.PI * 2 + time * speed) *
            amplitudeFactor *
            80 *
            volume;

          const y = centerY + wave;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }
    };

    draw();
  }

  //  silence detection
  detectSilence() {
    const dataArray = new Uint8Array(this.analyser.fftSize);

    const checkVolume = () => {
      this.analyser.getByteTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const x = dataArray[i] - 128;
        sum += x * x;
      }

      const volume = Math.sqrt(sum / dataArray.length);

      if (volume < this.silenceThreshold) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.stopRecording();
          }, this.silenceDuration);
        }
      } else {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      if (this.mediaRecorder.state === 'recording') {
        requestAnimationFrame(checkVolume);
      }
    };

    requestAnimationFrame(checkVolume);
  }

  //  stop recording
  stopRecording() {
    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      cancelAnimationFrame(this.animationId);
    }
  }

  //  handle transcriptin
  handleTranscription(blob: Blob) {
    this.state = 'processing';
    this.cd.detectChanges();

    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');

    this.http.post<any>('http://localhost:8000/api/handle_transcription', formData)
      .subscribe({
        next: (response) => {
          console.log('response: ', response.text)
          this.speakText(response.text, response.language);
        },
        error: (err) => {
          console.error(err);
          this.startRecording();
        }
      });
  }

  //  text to speech
  speakText(text: string, lang: string) {
    this.state = 'speaking';
    this.cd.detectChanges();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;

    utterance.onend = () => {
      this.startRecording(); // 🔁 LOOP AGAIN
    };

    speechSynthesis.speak(utterance);
  }
}
