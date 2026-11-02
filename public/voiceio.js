// WebAudio side of voice chat: capture the microphone, stream it, play other players' voices in 3-D,
// and expose live loudness / brightness per speaker so avatars can lip-sync.
import { RATE, toPcm16, fromPcm16, rms, packFrame, Gate, centroid, schedule } from './voicechat.js';

export class VoiceIO {
  constructor(send, getId) {
    this.send = send; this.getId = getId;
    this.ctx = null; this.on = false; this.stream = null; this.proc = null; this.mute = false;
    this.local = { level: 0, bright: 0, at: 0 }; this.speakers = new Map(); this.gate = new Gate();
  }
  ensureCtx() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  async start() {
    if (this.on) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone needs a secure (https) connection');
    const ctx = this.ensureCtx(); if (!ctx) throw new Error('Audio is not available');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const src = ctx.createMediaStreamSource(this.stream);
    this.an = ctx.createAnalyser(); this.an.fftSize = 512; this.an.smoothingTimeConstant = 0.3;
    this.proc = ctx.createScriptProcessor(2048, 1, 1);
    const silent = ctx.createGain(); silent.gain.value = 0; // keeps the processor running without echoing the mic
    src.connect(this.an); src.connect(this.proc); this.proc.connect(silent); silent.connect(ctx.destination);
    this.src = src; this.silent = silent;
    this.proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0), lv = rms(d), dt = d.length / ctx.sampleRate;
      this.local.level = lv; this.local.at = performance.now();
      if (!this.mute && this.gate.step(lv, dt)) this.send(packFrame(this.getId() || 0, toPcm16(d, ctx.sampleRate)));
    };
    this.on = true; return true;
  }
  stop() {
    this.on = false;
    try { this.proc && (this.proc.onaudioprocess = null, this.proc.disconnect()); this.src && this.src.disconnect(); this.silent && this.silent.disconnect(); } catch {}
    this.stream && this.stream.getTracks().forEach(t => t.stop());
    this.stream = this.proc = this.src = this.an = null; this.local.level = 0;
  }
  // brightness of my own voice, for lip shape
  sampleLocal() {
    if (!this.on || !this.an || performance.now() - this.local.at > 400) return { level: 0, bright: 0 };
    const bins = new Uint8Array(this.an.frequencyBinCount); this.an.getByteFrequencyData(bins);
    return { level: this.local.level, bright: centroid(bins.subarray(0, Math.floor(bins.length * 0.5))) };
  }
  speaker(id) {
    let s = this.speakers.get(id);
    if (!s) {
      const ctx = this.ctx, pre = ctx.createGain(), gain = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, an = ctx.createAnalyser();
      an.fftSize = 512; an.smoothingTimeConstant = 0.3;
      pre.connect(an); pre.connect(gain); // lips follow the speaker's own level, not the distance fade
      if (pan) { gain.connect(pan); pan.connect(ctx.destination); } else gain.connect(ctx.destination);
      s = { pre, gain, pan, an, cursor: 0, last: 0, time: new Uint8Array(an.fftSize), bins: new Uint8Array(an.frequencyBinCount) };
      this.speakers.set(id, s);
    }
    return s;
  }
  play(id, pcm, g, pan) {
    if (this.mute || !g || !this.ensureCtx() || !pcm.length) return;
    const ctx = this.ctx, s = this.speaker(id), buf = ctx.createBuffer(1, pcm.length, RATE);
    buf.copyToChannel(fromPcm16(pcm), 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(s.pre);
    s.gain.gain.value = g; if (s.pan) s.pan.pan.value = pan;
    const sc = schedule(s.cursor, ctx.currentTime, buf.duration); s.cursor = sc.next; s.last = performance.now();
    src.start(sc.start);
  }
  sampleRemote(id) {
    const s = this.speakers.get(id);
    if (!s || performance.now() - s.last > 500) return { level: 0, bright: 0 };
    s.an.getByteTimeDomainData(s.time); s.an.getByteFrequencyData(s.bins);
    let sum = 0; for (const v of s.time) { const x = (v - 128) / 128; sum += x * x; }
    return { level: Math.sqrt(sum / s.time.length) * 1.6, bright: centroid(s.bins.subarray(0, Math.floor(s.bins.length * 0.5))) };
  }
  drop(id) { const s = this.speakers.get(id); if (s) { try { s.pre.disconnect(); s.gain.disconnect(); } catch {} this.speakers.delete(id); } }
}
