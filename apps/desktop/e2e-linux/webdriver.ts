/**
 * The few W3C WebDriver commands the Linux end-to-end tests use, over plain HTTP (ADR 0063).
 * WebKitGTK is driven through WebDriver, as Playwright cannot attach to it.
 */

/** The key WebDriver sends for Enter. */
export const ENTER = "";

/** What W3C WebDriver calls an element: an object with this one key. */
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

interface Answer {
  value: unknown;
}

function isAnswer(value: unknown): value is Answer {
  return typeof value === "object" && value !== null && "value" in value;
}

/** A WebDriver error, with what the driver said. */
export class WebDriverError extends Error {}

async function call(url: string, method: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const answer: unknown = await response.json();
  if (!isAnswer(answer)) throw new WebDriverError(`${method} ${url}: no value in the answer`);
  if (!response.ok) {
    throw new WebDriverError(`${method} ${url}: ${JSON.stringify(answer.value)}`);
  }
  return answer.value;
}

function elementId(value: unknown): string {
  if (typeof value === "object" && value !== null && ELEMENT_KEY in value) {
    const id: unknown = Reflect.get(value, ELEMENT_KEY);
    if (typeof id === "string") return id;
  }
  throw new WebDriverError(`not an element: ${JSON.stringify(value)}`);
}

/** One element of the page. */
export class Element {
  constructor(
    private readonly session: Session,
    readonly id: string,
  ) {}

  /** Clicks the element the way a person would, through the web engine's own input. */
  async click(): Promise<void> {
    await this.session.post(`/element/${this.id}/click`, {});
  }

  /** Types into the element, through the web engine's own input. */
  async type(text: string): Promise<void> {
    await this.session.post(`/element/${this.id}/value`, { text });
  }

  async text(): Promise<string> {
    return String(await this.session.get(`/element/${this.id}/text`));
  }
}

/** A WebDriver session: one start of the app. */
export class Session {
  private constructor(
    private readonly base: string,
    readonly id: string,
  ) {}

  /** Starts a session, and with it the application the capabilities name. */
  static async start(driver: string, capabilities: Record<string, unknown>): Promise<Session> {
    const value = await call(`${driver}/session`, "POST", {
      capabilities: { alwaysMatch: capabilities },
    });
    const id: unknown =
      typeof value === "object" && value !== null ? Reflect.get(value, "sessionId") : undefined;
    if (typeof id !== "string") throw new WebDriverError(`no session: ${JSON.stringify(value)}`);
    return new Session(`${driver}/session/${id}`, id);
  }

  get(path: string): Promise<unknown> {
    return call(`${this.base}${path}`, "GET");
  }

  post(path: string, body: unknown): Promise<unknown> {
    return call(`${this.base}${path}`, "POST", body);
  }

  /** Runs a function in the page and returns what it returns. */
  async run<T>(script: string, ...args: unknown[]): Promise<T> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller says what the script returns
    return (await this.post("/execute/sync", { script, args })) as T;
  }

  /** Runs an async function in the page, which calls its last argument with the result. */
  async runAsync<T>(script: string, ...args: unknown[]): Promise<T> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller says what the script returns
    return (await this.post("/execute/async", { script, args })) as T;
  }

  /** The element a function in the page returns, or `undefined` when it returns nothing. */
  async pick(script: string, ...args: unknown[]): Promise<Element | undefined> {
    const found = await this.post("/execute/sync", { script, args });
    return found === null || found === undefined ? undefined : new Element(this, elementId(found));
  }

  /** The first element the CSS selector matches, or `undefined` for none. */
  async find(selector: string): Promise<Element | undefined> {
    const found = await this.post("/elements", { using: "css selector", value: selector });
    const first: unknown = Array.isArray(found) ? found[0] : undefined;
    return first === undefined ? undefined : new Element(this, elementId(first));
  }

  /** Ends the session, which closes the application. */
  async end(): Promise<void> {
    await call(this.base, "DELETE");
  }
}
