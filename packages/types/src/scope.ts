import type { Attachment } from './attachment';
import type { Breadcrumb } from './breadcrumb';
import type { Context, Contexts } from './context';
import type { EventProcessor } from './eventprocessor';
import type { Extra, Extras } from './extra';
import type { Primitive } from './misc';
import type { RequestSession, Session } from './session';
import type { Severity, SeverityLevel } from './severity';
import type { Span } from './span';
import type { PropagationContext } from './tracing';
import type { Transaction } from './transaction';
import type { User } from './user';

/** JSDocs */
export type CaptureContext = Scope | Partial<ScopeContext> | ((scope: Scope) => Scope);

/** JSDocs */
export interface ScopeContext {
  user: User;
  // eslint-disable-next-line deprecation/deprecation
  level: Severity | SeverityLevel;
  extra: Extras;
  contexts: Contexts;
  tags: { [key: string]: Primitive };
  fingerprint: string[];
  requestSession: RequestSession;
  propagationContext: PropagationContext;
}

/**
 * Holds additional event information. {@link Scope.applyToEvent} will be called by the client before an event is sent.
 */
export interface Scope {
  /** Add new event processor that will be called after {@link applyToEvent}. */
  addEventProcessor(callback: EventProcessor): this;

  /**
   * Updates user context information for future events.
   *
   * @param user User context object to be set in the current context. Pass `null` to unset the user.
   */
  setUser(user: User | null): this;

  /**
   * Returns the `User` if there is one
   */
  getUser(): User | undefined;

  /**
   * Set an object that will be merged sent as tags data with the event.
   * @param tags Tags context object to merge into current context.
   */
  setTags(tags: { [key: string]: Primitive }): this;

  /**
   * Set key:value that will be sent as tags data with the event.
   *
   * Can also be used to unset a tag by passing `undefined`.
   *
   * @param key String key of tag
   * @param value Value of tag
   */
  setTag(key: string, value: Primitive): this;

  /**
   * Set an object that will be merged sent as extra data with the event.
   * @param extras Extras object to merge into current context.
   */
  setExtras(extras: Extras): this;

  /**
   * Set key:value that will be sent as extra data with the event.
   * @param key String of extra
   * @param extra Any kind of data. This data will be normalized.
   */
  setExtra(key: string, extra: Extra): this;

  /**
   * Sets the fingerprint on the scope to send with the events.
   * @param fingerprint string[] to group events in Sentry.
   */
  setFingerprint(fingerprint: string[]): this;

  /**
   * Sets the level on the scope for future events.
   * @param level string {@link SeverityLevel}
   */
  setLevel(
    // eslint-disable-next-line deprecation/deprecation
    level: Severity | SeverityLevel,
  ): this;

  /**
   * Sets the transaction name on the scope for future events.
   */
  setTransactionName(name?: string): this;

  /**
   * Sets context data with the given name.
   * @param name of the context
   * @param context an object containing context data. This data will be normalized. Pass `null` to unset the context.
   */
  setContext(name: string, context: Context | null): this;

  /**
   * Sets the Span on the scope.
   * @param span Span
   */
  setSpan(span?: Span): this;

  /**
   * Returns the `Span` if there is one
   */
  getSpan(): Span | undefined;

  /**
   * Returns the `Transaction` attached to the scope (if there is one)
   */
  getTransaction(): Transaction | undefined;

  /**
   * Returns the `Session` if there is one
   */
  getSession(): Session | undefined;

  /**
   * Sets the `Session` on the scope
   */
  setSession(session?: Session): this;

  /**
   * Returns the `RequestSession` if there is one
   */
  getRequestSession(): RequestSession | undefined;

  /**
   * Sets the `RequestSession` on the scope
   */
  setRequestSession(requestSession?: RequestSession): this;

  /**
   * Updates the scope with provided data. Can work in three variations:
   * - plain object containing updatable attributes
   * - Scope instance that'll extract the attributes from
   * - callback function that'll receive the current scope as an argument and allow for modifications
   * @param captureContext scope modifier to be used
   */
  update(captureContext?: CaptureContext): this;

  /** Clears the current scope and resets its properties. */
  clear(): this;

  /**
   * Sets the breadcrumbs in the scope
   * @param breadcrumbs Breadcrumb
   * @param maxBreadcrumbs number of max breadcrumbs to merged into event.
   */
  addBreadcrumb(breadcrumb: Breadcrumb, maxBreadcrumbs?: number): this;

  /**
   * Get the last breadcrumb.
   */
  getLastBreadcrumb(): Breadcrumb | undefined;

  /**
   * Clears all currently set Breadcrumbs.
   */
  clearBreadcrumbs(): this;

  /**
   * Adds an attachment to the scope
   * @param attachment Attachment options
   */
  addAttachment(attachment: Attachment): this;

  /**
   * Returns an array of attachments on the scope
   */
  getAttachments(): Attachment[];

  /**
   * Clears attachments from the scope
   */
  clearAttachments(): this;

  /**
   * Add data which will be accessible during event processing but won't get sent to Sentry
   */
  setSDKProcessingMetadata(newData: { [key: string]: unknown }): this;

  /**
   * Add propagation context to the scope, used for distributed tracing
   */
  setPropagationContext(context: PropagationContext): this;
}
