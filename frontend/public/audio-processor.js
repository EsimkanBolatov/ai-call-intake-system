class AudioRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.isRecording = false;
        this.bufferSize = 4096; 
        this.buffer = new Float32Array(this.bufferSize);
        this.bytesWritten = 0;
        
        this.port.onmessage = (event) => {
            if (event.data.type === 'startRecording') {
                this.isRecording = true;
            } else if (event.data.type === 'stopRecording') {
                this.isRecording = false;
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this.isRecording) return true;

        const input = inputs[0];
        if (input && input.length > 0) {
            const inputChannel = input[0];
            
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