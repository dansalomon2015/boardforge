export class ComposedGameRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposedGameRuleError";
  }
}
