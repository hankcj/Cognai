export function printSection(title: string, body: string): void {
  process.stdout.write(`\n${title}\n${body}\n`);
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
