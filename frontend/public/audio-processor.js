class AudioRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        this.bufferSize = 4096; 
        this.buffer = new Float32Array(this.bufferSize);
        this.bytesWritten = 0;
        
        console.log('[AudioWorklet] Constructor called');
        
        this.port.onmessage = (event) => {
            console.log('[AudioWorklet] Message received:', event.data);
            if (event.data.type === 'startRecording') {
                this.isRecording = true;
                console.log('[AudioWorklet] Recording started');
            } else if (event.data.type === 'stopRecording') {
                this.isRecording = false;
                console.log('[AudioWorklet] Recording stopped');
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this.isRecording) return true;

        const input = inputs[0];
        if (input && input.length > 0) {
            const inputChannel = input[0];
            console.log('[AudioWorklet] Processing audio chunk, length:', inputChannel.length);
            
            // Отправляем сырые float32 данные
            this.port.postMessage({
                type: 'audioChunk',
                chunk: inputChannel
            });
        }
        return true;
    }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);