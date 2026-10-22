/**
 * Media Handler: Voice recording, image previews, lightboxes, and file attachments.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MediaHandler = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  class MediaHandler {
    constructor() {
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.audioStream = null;
      this.recordingStartTime = null;
      this.recordingTimer = null;
      this.isRecording = false;
    }

    /**
     * Format byte count into human readable string (KB, MB, GB).
     */
    static formatBytes(bytes, decimals = 1) {
      if (!bytes || bytes === 0) return '0 B';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Start recording audio from the user's microphone.
     */
    async startVoiceRecording(onDurationTick) {
      if (this.isRecording) return;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser context');
      }

      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ].find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) || '';

      const options = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(this.audioStream, options);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.recordingStartTime = Date.now();
      this.isRecording = true;

      if (onDurationTick) {
        this.recordingTimer = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - this.recordingStartTime) / 1000);
          const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
          const secs = (elapsedSec % 60).toString().padStart(2, '0');
          onDurationTick(`${mins}:${secs}`, elapsedSec);
        }, 500);
      }

      this.mediaRecorder.start(250); // Slice chunks every 250ms
    }

    /**
     * Stop voice recording and return audio metadata and base64 Data URL.
     */
    stopVoiceRecording() {
      return new Promise((resolve, reject) => {
        if (!this.mediaRecorder || !this.isRecording) {
          return reject(new Error('No active recording'));
        }

        clearInterval(this.recordingTimer);
        const durationSec = Math.max(1, Math.round((Date.now() - this.recordingStartTime) / 1000));

        this.mediaRecorder.onstop = async () => {
          try {
            const blobType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: blobType });
            const dataUrl = await this.blobToDataUrl(audioBlob);

            this._cleanupStream();
            this.isRecording = false;

            resolve({
              type: 'voice',
              mimeType: blobType,
              data: dataUrl,
              duration: durationSec,
              size: audioBlob.size,
              formattedSize: MediaHandler.formatBytes(audioBlob.size)
            });
          } catch (err) {
            this._cleanupStream();
            this.isRecording = false;
            reject(err);
          }
        };

        this.mediaRecorder.stop();
      });
    }

    /**
     * Cancel and discard current voice recording.
     */
    cancelVoiceRecording() {
      clearInterval(this.recordingTimer);
      if (this.mediaRecorder && this.isRecording) {
        this.mediaRecorder.stop();
      }
      this._cleanupStream();
      this.audioChunks = [];
      this.isRecording = false;
    }

    _cleanupStream() {
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
      }
    }

    /**
     * Process a selected file (image, document, audio, video) and convert to transfer payload.
     */
    async processFile(file) {
      if (!file) throw new Error('No file provided');

      const isImage = file.type.startsWith('image/');
      const dataUrl = await this.fileToDataUrl(file);

      return {
        name: file.name,
        type: isImage ? 'image' : 'file',
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        formattedSize: MediaHandler.formatBytes(file.size),
        data: dataUrl
      };
    }

    fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }

    blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }

    /**
     * Display an image in an overlay lightbox.
     */
    openLightbox(imageSrc, caption = '') {
      let modal = document.getElementById('lightbox-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lightbox-modal';
        modal.className = 'lightbox-overlay';
        modal.innerHTML = `
          <div class="lightbox-backdrop"></div>
          <div class="lightbox-content">
            <button class="lightbox-close" title="Close (Esc)">&times;</button>
            <img class="lightbox-img" src="" alt="Full preview" />
            <div class="lightbox-bar">
              <span class="lightbox-caption"></span>
              <a class="lightbox-download" download="image" href="#" target="_blank">Download</a>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeBtn = modal.querySelector('.lightbox-close');
        const backdrop = modal.querySelector('.lightbox-backdrop');

        const close = () => {
          modal.classList.remove('active');
        };

        closeBtn.onclick = close;
        backdrop.onclick = close;
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && modal.classList.contains('active')) {
            close();
          }
        });
      }

      const img = modal.querySelector('.lightbox-img');
      const cap = modal.querySelector('.lightbox-caption');
      const dl = modal.querySelector('.lightbox-download');

      const safeSrc = (typeof imageSrc === 'string' && /^(data:image\/|https?:\/\/|blob:)/i.test(imageSrc.trim()))
        ? imageSrc.trim()
        : '#';

      img.src = safeSrc;
      cap.textContent = caption;
      dl.href = safeSrc;
      dl.download = caption || 'image';

      modal.classList.add('active');
    }
  }

  return MediaHandler;
});
