export class RingBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0;
  private count = 0;

  public constructor(private readonly capacity: number) {
    this.buffer = new Array<T | undefined>(capacity);
  }

  public add(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
  }

  public toArray(limit?: number): T[] {
    const total = this.count;
    const max = limit === undefined ? total : Math.min(limit, total);
    const result: T[] = [];

    const startIdx =
      total < this.capacity
        ? Math.max(0, total - max)
        : (this.head - max + this.capacity) % this.capacity;

    for (let i = 0; i < max; i++) {
      const idx = (startIdx + i) % this.capacity;
      const item = this.buffer[idx];
      if (item !== undefined) {
        result.push(item);
      }
    }

    return result;
  }

  public clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = undefined;
    }
    this.head = 0;
    this.count = 0;
  }

  public get size(): number {
    return this.count;
  }
}
