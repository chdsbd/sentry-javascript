import type { Breadcrumb, BreadcrumbHint } from './breadcrumb';
import type { CheckIn, MonitorConfig } from './checkin';
import type { EventDropReason } from './clientreport';
import type { DataCategory } from './datacategory';
import type { DsnComponents } from './dsn';
import type { DynamicSamplingContext, Envelope } from './envelope';
import type { Event, EventHint } from './event';
import type { Integration, IntegrationClass } from './integration';
import type { ClientOptions } from './options';
import type { Scope } from './scope';
import type { SdkMetadata } from './sdkmetadata';
import type { Session, SessionAggregates } from './session';
import type { Severity, SeverityLevel } from './severity';
import type { Transaction } from './transaction';
import type { Transport, TransportMakeRequestResponse } from './transport';

/**
 * User-Facing Sentry SDK Client.
 *
 * This interface contains all methods to interface with the SDK once it has
 * been installed. It allows to send events to Sentry, record breadcrumbs and
 * set a context included in every event. Since the SDK mutates its environment,
 * there will only be one instance during runtime.
 *
 */
export interface Client<O extends ClientOptions = ClientOptions> {
  /**
   * Captures an exception event and sends it to Sentry.
   *
   * @param exception An exception-like object.
   * @param hint May contain additional information about the original exception.
   * @param scope An optional scope containing event metadata.
   * @returns The event id
   */
  captureException(exception: any, hint?: EventHint, scope?: Scope): string | undefined;

  /**
   * Captures a message event and sends it to Sentry.
   *
   * @param message The message to send to Sentry.
   * @param level Define the level of the message.
   * @param hint May contain additional information about the original exception.
   * @param scope An optional scope containing event metadata.
   * @returns The event id
   */
  captureMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
    scope?: Scope,
  ): string | undefined;

  /**
   * Captures a manually created event and sends it to Sentry.
   *
   * @param event The event to send to Sentry.
   * @param hint May contain additional information about the original exception.
   * @param scope An optional scope containing event metadata.
   * @returns The event id
   */
  captureEvent(event: Event, hint?: EventHint, scope?: Scope): string | undefined;

  /**
   * Captures a session
   *
   * @param session Session to be delivered
   */
  captureSession?(session: Session): void;

  /**
   * Create a cron monitor check in and send it to Sentry. This method is not available on all clients.
   *
   * @param checkIn An object that describes a check in.
   * @param upsertMonitorConfig An optional object that describes a monitor config. Use this if you want
   * to create a monitor automatically when sending a check in.
   * @returns A string representing the id of the check in.
   */
  captureCheckIn?(checkIn: CheckIn, monitorConfig?: MonitorConfig): string;

  /** Returns the current Dsn. */
  getDsn(): DsnComponents | undefined;

  /** Returns the current options. */
  getOptions(): O;

  /**
   * @inheritdoc
   *
   * TODO (v8): Make this a required method.
   */
  getSdkMetadata?(): SdkMetadata | undefined;

  /**
   * Returns the transport that is used by the client.
   * Please note that the transport gets lazy initialized so it will only be there once the first event has been sent.
   *
   * @returns The transport.
   */
  getTransport(): Transport | undefined;

  /**
   * Flush the event queue and set the client to `enabled = false`. See {@link Client.flush}.
   *
   * @param timeout Maximum time in ms the client should wait before shutting down. Omitting this parameter will cause
   *   the client to wait until all events are sent before disabling itself.
   * @returns A promise which resolves to `true` if the flush completes successfully before the timeout, or `false` if
   * it doesn't.
   */
  close(timeout?: number): PromiseLike<boolean>;

  /**
   * Wait for all events to be sent or the timeout to expire, whichever comes first.
   *
   * @param timeout Maximum time in ms the client should wait for events to be flushed. Omitting this parameter will
   *   cause the client to wait until all events are sent before resolving the promise.
   * @returns A promise that will resolve with `true` if all events are sent before the timeout, or `false` if there are
   * still events in the queue when the timeout is reached.
   */
  flush(timeout?: number): PromiseLike<boolean>;

  /** Returns the client's instance of the given integration class, it any. */
  getIntegration<T extends Integration>(integration: IntegrationClass<T>): T | null;

  /**
   * Add an integration to the client.
   * This can be used to e.g. lazy load integrations.
   * In most cases, this should not be necessary, and you're better off just passing the integrations via `integrations: []` at initialization time.
   * However, if you find the need to conditionally load & add an integration, you can use `addIntegration` to do so.
   *
   * TODO (v8): Make this a required method.
   * */
  addIntegration?(integration: Integration): void;

  /** This is an internal function to setup all integrations that should run on the client */
  setupIntegrations(): void;

  /** Creates an {@link Event} from all inputs to `captureException` and non-primitive inputs to `captureMessage`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventFromException(exception: any, hint?: EventHint): PromiseLike<Event>;

  /** Creates an {@link Event} from primitive inputs to `captureMessage`. */
  eventFromMessage(
    message: string,
    // eslint-disable-next-line deprecation/deprecation
    level?: Severity | SeverityLevel,
    hint?: EventHint,
  ): PromiseLike<Event>;

  /** Submits the event to Sentry */
  sendEvent(event: Event, hint?: EventHint): void;

  /** Submits the session to Sentry */
  sendSession(session: Session | SessionAggregates): void;

  /**
   * Record on the client that an event got dropped (ie, an event that will not be sent to sentry).
   *
   * @param reason The reason why the event got dropped.
   * @param category The data category of the dropped event.
   * @param event The dropped event.
   */
  recordDroppedEvent(reason: EventDropReason, dataCategory: DataCategory, event?: Event): void;

  // HOOKS
  // TODO(v8): Make the hooks non-optional.

  /**
   * Register a callback for transaction start and finish.
   */
  on?(hook: 'startTransaction' | 'finishTransaction', callback: (transaction: Transaction) => void): void;

  /**
   * Register a callback for transaction start and finish.
   */
  on?(hook: 'beforeEnvelope', callback: (envelope: Envelope) => void): void;

  /**
   * Register a callback for when an event has been sent.
   */
  on?(
    hook: 'afterSendEvent',
    callback: (event: Event, sendResponse: TransportMakeRequestResponse | void) => void,
  ): void;

  /**
   * Register a callback before a breadcrumb is added.
   */
  on?(hook: 'beforeAddBreadcrumb', callback: (breadcrumb: Breadcrumb, hint?: BreadcrumbHint) => void): void;

  /**
   * Register a callback whena  DSC (Dynamic Sampling Context) is created.
   */
  on?(hook: 'createDsc', callback: (dsc: DynamicSamplingContext) => void): void;

  /**
   * Fire a hook event for transaction start and finish. Expects to be given a transaction as the
   * second argument.
   */
  emit?(hook: 'startTransaction' | 'finishTransaction', transaction: Transaction): void;

  /*
   * Fire a hook event for envelope creation and sending. Expects to be given an envelope as the
   * second argument.
   */
  emit?(hook: 'beforeEnvelope', envelope: Envelope): void;

  /*
   * Fire a hook event after sending an event. Expects to be given an Event as the
   * second argument.
   */
  emit?(hook: 'afterSendEvent', event: Event, sendResponse: TransportMakeRequestResponse | void): void;

  /**
   * Fire a hook for when a breadcrumb is added. Expects the breadcrumb as second argument.
   */
  emit?(hook: 'beforeAddBreadcrumb', breadcrumb: Breadcrumb, hint?: BreadcrumbHint): void;

  /**
   * Fire a hook for when a DSC (Dynamic Sampling Context) is created. Expects the DSC as second argument.
   */
  emit?(hook: 'createDsc', dsc: DynamicSamplingContext): void;
}
