import process from "node:process";

import type { LogLevel } from "./config.js";

type LogFields = Record<string, unknown>;

const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export class Logger {
  public constructor(
    private readonly level: LogLevel,
    private readonly bindings: LogFields = {},
  ) {}

  public child(bindings: LogFields): Logger {
    return new Logger(this.level, { ...this.bindings, ...bindings });
  }

  public debug(message: string, fields: LogFields = {}): void {
    this.write("debug", message, fields);
  }

  public info(message: string, fields: LogFields = {}): void {
    this.write("info", message, fields);
  }

  public warn(message: string, fields: LogFields = {}): void {
    this.write("warn", message, fields);
  }

  public error(message: string, fields: LogFields = {}): void {
    this.write("error", message, fields);
  }

  private write(
    level: Exclude<LogLevel, "silent">,
    message: string,
    fields: LogFields,
  ) {
    if (weights[level] < weights[this.level]) {
      return;
    }

    const payload = {
      time: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...fields,
    };

    process.stderr.write(`${JSON.stringify(payload, replacer)}\n`);
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  return value;
}
