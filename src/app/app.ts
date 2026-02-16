import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private dataArray!: Uint8Array;
  private ctx!: CanvasRenderingContext2D;
  private rafId: number | null = null;

  listening = false;

  ngOnInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
  }

  /**
   * Toggle capture
   */
  async getAudioContext() {
    if (this.listening) {
      await this.stopListening();
      return;
    }

    // Start listening
    await this.startListening();
  }

  private async startListening() {
    // 1) Acquire mic
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 2) Create context + nodes
    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(this.stream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;

    // 3) Wire graph: source -> analyser
    this.source.connect(this.analyser);

    // 4) Prepare buffer for analyser
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength));

    // 5) Start visualizer
    this.listening = true;
    this.animate();
  }

  private async stopListening() {
    // 1) Cancel the animation loop
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // 2) Stop input tracks (releases mic)
    this.stream?.getAudioTracks().forEach(t => t.stop());

    // 3) Disconnect nodes
    try { this.source?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}

    // 4) Close the audio context
    try { await this.audioContext?.close(); } catch {}

    // 5) Clear references
    this.source = null;
    this.analyser = null;
    this.audioContext = null;
    this.stream = null;

    this.listening = false;

    // (Optional) Clear canvas
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private animate() {
    // Schedule next frame first, so we always have a handle to cancel
    this.rafId = requestAnimationFrame(() => this.animate());

    if (!this.analyser) return;

    // Read analyser data
    this.analyser.getByteFrequencyData(this.dataArray as unknown as Uint8Array<ArrayBuffer>);

    const canvas = this.canvasRef.nativeElement;
    const width = canvas.width;
    const height = canvas.height;

    this.ctx.clearRect(0, 0, width, height);

    const barWidth = width / this.dataArray.length;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const barHeight = this.dataArray[i];

      const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#d18d8d');
      gradient.addColorStop(1, '#d62506');

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

      x += barWidth;
    }
  }
}