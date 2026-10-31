/** Play directly inside the host's click event to retain browser user activation. */
export class VerdictAudio {
  private correct = new Audio("/sounds/benar.mp3");
  private wrong = new Audio("/sounds/salah.mp3");

  constructor() {
    for (const audio of [this.correct, this.wrong]) {
      audio.preload = "auto";
      audio.load();
    }
  }

  stop() {
    for (const audio of [this.correct, this.wrong]) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  play(correct: boolean): Promise<boolean> {
    try {
      this.stop();
      const audio = correct ? this.correct : this.wrong;
      audio.muted = false;
      audio.volume = 1;
      // Do not await a network request before calling play().
      return audio.play().then(() => true, () => false);
    } catch { return Promise.resolve(false); }
  }

  dispose() {
    this.stop();
    for (const audio of [this.correct, this.wrong]) {
      audio.removeAttribute("src");
      audio.load();
    }
  }
}
