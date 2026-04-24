export class CognaiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CognaiError";
  }
}
