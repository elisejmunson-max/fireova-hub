/** Owns request order and server offsets independently of rendered/deduplicated rows. */
export class MediaPageRequests {
  private generation = 0;
  private active: { token: number; controller: AbortController } | null = null;
  private key: string;
  private offset: number;
  constructor(key = "", offset = 0) {
    this.key = key;
    this.offset = offset;
  }
  private failedReset = false;

  begin(key: string, reset: boolean) {
    reset = reset || key !== this.key || this.failedReset;
    if (this.active && !reset) return null;
    this.active?.controller.abort();
    if (reset) this.offset = 0;
    this.key = key;
    this.failedReset = false;
    const token = ++this.generation;
    const controller = new AbortController();
    this.active = { token, controller };
    return { token, offset: this.offset, reset, signal: controller.signal };
  }

  current(token: number) {
    return this.active?.token === token;
  }
  complete(token: number, nextOffset: number) {
    if (!this.current(token)) return false;
    this.offset = nextOffset;
    this.active = null;
    return true;
  }
  fail(token: number, reset: boolean) {
    if (!this.current(token)) return false;
    this.failedReset = reset;
    this.active = null;
    return true;
  }
  cancel() {
    this.active?.controller.abort();
    this.active = null;
    this.generation++;
  }
}
