// Synthesizes ringtones and dial tones using the native WebAudio API

let audioCtx: AudioContext | null = null;
let ringInterval: any = null;
let dialInterval: any = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

const createBeep = (freq1: number, freq2: number, duration: number, volume: number = 0.1) => {
    if (!audioCtx) return;
    
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = freq1;
    osc2.frequency.value = freq2;

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start(audioCtx.currentTime);
    osc2.start(audioCtx.currentTime);
    
    osc1.stop(audioCtx.currentTime + duration);
    osc2.stop(audioCtx.currentTime + duration);
};

export const playRingtone = () => {
    initAudio();
    stopTones();
    
    // Classic UK/European style double ring
    const ring = () => {
        createBeep(400, 450, 0.4);
        setTimeout(() => createBeep(400, 450, 0.4), 600);
    };
    
    ring();
    ringInterval = setInterval(ring, 3000);
};

export const playMessageSound = () => {
    initAudio();
    // A quick, pleasant pop/chime for incoming messages.
    createBeep(600, 800, 0.1, 0.05);
};

export const playDialTone = () => {
    initAudio();
    stopTones();
    
    // US style ringing out
    const dial = () => {
        createBeep(440, 480, 2, 0.05);
    };
    
    dial();
    dialInterval = setInterval(dial, 4000);
};

export const stopTones = () => {
    if (ringInterval) clearInterval(ringInterval);
    if (dialInterval) clearInterval(dialInterval);
    ringInterval = null;
    dialInterval = null;
};
