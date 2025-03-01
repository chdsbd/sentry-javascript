/* eslint-disable max-lines */

import { DEFAULT_ENVIRONMENT, getCurrentHub } from '@sentry/core';
import type { DebugImage, Envelope, Event, StackFrame, StackParser } from '@sentry/types';
import type { Profile, ThreadCpuProfile } from '@sentry/types/src/profiling';
import { forEachEnvelopeItem, GLOBAL_OBJ, logger, uuid4 } from '@sentry/utils';

import { WINDOW } from '../helpers';
import type { JSSelfProfile, JSSelfProfileStack } from './jsSelfProfiling';

const MS_TO_NS = 1e6;
// Use 0 as main thread id which is identical to threadId in node:worker_threads
// where main logs 0 and workers seem to log in increments of 1
const THREAD_ID_STRING = String(0);
const THREAD_NAME = 'main';

// Machine properties (eval only once)
let OS_PLATFORM = '';
let OS_PLATFORM_VERSION = '';
let OS_ARCH = '';
let OS_BROWSER = (WINDOW.navigator && WINDOW.navigator.userAgent) || '';
let OS_MODEL = '';
const OS_LOCALE =
  (WINDOW.navigator && WINDOW.navigator.language) ||
  (WINDOW.navigator && WINDOW.navigator.languages && WINDOW.navigator.languages[0]) ||
  '';

type UAData = {
  platform?: string;
  architecture?: string;
  model?: string;
  platformVersion?: string;
  fullVersionList?: {
    brand: string;
    version: string;
  }[];
};

interface UserAgentData {
  getHighEntropyValues: (keys: string[]) => Promise<UAData>;
}

function isUserAgentData(data: unknown): data is UserAgentData {
  return typeof data === 'object' && data !== null && 'getHighEntropyValues' in data;
}

// @ts-ignore userAgentData is not part of the navigator interface yet
const userAgentData = WINDOW.navigator && WINDOW.navigator.userAgentData;

if (isUserAgentData(userAgentData)) {
  userAgentData
    .getHighEntropyValues(['architecture', 'model', 'platform', 'platformVersion', 'fullVersionList'])
    .then((ua: UAData) => {
      OS_PLATFORM = ua.platform || '';
      OS_ARCH = ua.architecture || '';
      OS_MODEL = ua.model || '';
      OS_PLATFORM_VERSION = ua.platformVersion || '';

      if (ua.fullVersionList && ua.fullVersionList.length > 0) {
        const firstUa = ua.fullVersionList[ua.fullVersionList.length - 1];
        OS_BROWSER = `${firstUa.brand} ${firstUa.version}`;
      }
    })
    .catch(e => void e);
}

function isProcessedJSSelfProfile(profile: ThreadCpuProfile | JSSelfProfile): profile is JSSelfProfile {
  return !('thread_metadata' in profile);
}

// Enriches the profile with threadId of the current thread.
// This is done in node as we seem to not be able to get the info from C native code.
/**
 *
 */
export function enrichWithThreadInformation(profile: ThreadCpuProfile | JSSelfProfile): ThreadCpuProfile {
  if (!isProcessedJSSelfProfile(profile)) {
    return profile;
  }

  return convertJSSelfProfileToSampledFormat(profile);
}

// Profile is marked as optional because it is deleted from the metadata
// by the integration before the event is processed by other integrations.
export interface ProfiledEvent extends Event {
  sdkProcessingMetadata: {
    profile?: JSSelfProfile;
  };
}

function getTraceId(event: Event): string {
  const traceId: unknown = event && event.contexts && event.contexts['trace'] && event.contexts['trace']['trace_id'];
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (typeof traceId === 'string' && traceId.length !== 32) {
    if (__DEBUG_BUILD__) {
      logger.log(`[Profiling] Invalid traceId: ${traceId} on profiled event`);
    }
  }
  if (typeof traceId !== 'string') {
    return '';
  }

  return traceId;
}
/**
 * Creates a profiling event envelope from a Sentry event. If profile does not pass
 * validation, returns null.
 * @param event
 * @param dsn
 * @param metadata
 * @param tunnel
 * @returns {EventEnvelope | null}
 */

/**
 * Creates a profiling event envelope from a Sentry event.
 */
export function createProfilePayload(
  event: ProfiledEvent,
  processedProfile: JSSelfProfile,
  profile_id: string,
): Profile {
  if (event.type !== 'transaction') {
    // createProfilingEventEnvelope should only be called for transactions,
    // we type guard this behavior with isProfiledTransactionEvent.
    throw new TypeError('Profiling events may only be attached to transactions, this should never occur.');
  }

  if (processedProfile === undefined || processedProfile === null) {
    throw new TypeError(
      `Cannot construct profiling event envelope without a valid profile. Got ${processedProfile} instead.`,
    );
  }

  const traceId = getTraceId(event);
  const enrichedThreadProfile = enrichWithThreadInformation(processedProfile);
  const transactionStartMs = typeof event.start_timestamp === 'number' ? event.start_timestamp * 1000 : Date.now();
  const transactionEndMs = typeof event.timestamp === 'number' ? event.timestamp * 1000 : Date.now();

  const profile: Profile = {
    event_id: profile_id,
    timestamp: new Date(transactionStartMs).toISOString(),
    platform: 'javascript',
    version: '1',
    release: event.release || '',
    environment: event.environment || DEFAULT_ENVIRONMENT,
    runtime: {
      name: 'javascript',
      version: WINDOW.navigator.userAgent,
    },
    os: {
      name: OS_PLATFORM,
      version: OS_PLATFORM_VERSION,
      build_number: OS_BROWSER,
    },
    device: {
      locale: OS_LOCALE,
      model: OS_MODEL,
      manufacturer: OS_BROWSER,
      architecture: OS_ARCH,
      is_emulator: false,
    },
    debug_meta: {
      images: applyDebugMetadata(processedProfile.resources),
    },
    profile: enrichedThreadProfile,
    transactions: [
      {
        name: event.transaction || '',
        id: event.event_id || uuid4(),
        trace_id: traceId,
        active_thread_id: THREAD_ID_STRING,
        relative_start_ns: '0',
        relative_end_ns: ((transactionEndMs - transactionStartMs) * 1e6).toFixed(0),
      },
    ],
  };

  return profile;
}

/**
 *
 */
export function isProfiledTransactionEvent(event: Event): event is ProfiledEvent {
  return !!(event.sdkProcessingMetadata && event.sdkProcessingMetadata['profile']);
}

/**
 * Converts a JSSelfProfile to a our sampled format.
 * Does not currently perform stack indexing.
 */
export function convertJSSelfProfileToSampledFormat(input: JSSelfProfile): Profile['profile'] {
  let EMPTY_STACK_ID: undefined | number = undefined;
  let STACK_ID = 0;

  // Initialize the profile that we will fill with data
  const profile: Profile['profile'] = {
    samples: [],
    stacks: [],
    frames: [],
    thread_metadata: {
      [THREAD_ID_STRING]: { name: THREAD_NAME },
    },
  };

  if (!input.samples.length) {
    return profile;
  }

  // We assert samples.length > 0 above and timestamp should always be present
  const start = input.samples[0].timestamp;

  for (let i = 0; i < input.samples.length; i++) {
    const jsSample = input.samples[i];

    // If sample has no stack, add an empty sample
    if (jsSample.stackId === undefined) {
      if (EMPTY_STACK_ID === undefined) {
        EMPTY_STACK_ID = STACK_ID;
        profile.stacks[EMPTY_STACK_ID] = [];
        STACK_ID++;
      }

      profile['samples'][i] = {
        // convert ms timestamp to ns
        elapsed_since_start_ns: ((jsSample.timestamp - start) * MS_TO_NS).toFixed(0),
        stack_id: EMPTY_STACK_ID,
        thread_id: THREAD_ID_STRING,
      };
      continue;
    }

    let stackTop: JSSelfProfileStack | undefined = input.stacks[jsSample.stackId];

    // Functions in top->down order (root is last)
    // We follow the stackTop.parentId trail and collect each visited frameId
    const stack: number[] = [];

    while (stackTop) {
      stack.push(stackTop.frameId);

      const frame = input.frames[stackTop.frameId];

      // If our frame has not been indexed yet, index it
      if (profile.frames[stackTop.frameId] === undefined) {
        profile.frames[stackTop.frameId] = {
          function: frame.name,
          file: frame.resourceId ? input.resources[frame.resourceId] : undefined,
          line: frame.line,
          column: frame.column,
        };
      }

      stackTop = stackTop.parentId === undefined ? undefined : input.stacks[stackTop.parentId];
    }

    const sample: Profile['profile']['samples'][0] = {
      // convert ms timestamp to ns
      elapsed_since_start_ns: ((jsSample.timestamp - start) * MS_TO_NS).toFixed(0),
      stack_id: STACK_ID,
      thread_id: THREAD_ID_STRING,
    };

    profile['stacks'][STACK_ID] = stack;
    profile['samples'][i] = sample;
    STACK_ID++;
  }

  return profile;
}

/**
 * Adds items to envelope if they are not already present - mutates the envelope.
 * @param envelope
 */
export function addProfilesToEnvelope(envelope: Envelope, profiles: Profile[]): Envelope {
  if (!profiles.length) {
    return envelope;
  }

  for (const profile of profiles) {
    // @ts-ignore untyped envelope
    envelope[1].push([{ type: 'profile' }, profile]);
  }
  return envelope;
}

/**
 * Finds transactions with profile_id context in the envelope
 * @param envelope
 * @returns
 */
export function findProfiledTransactionsFromEnvelope(envelope: Envelope): Event[] {
  const events: Event[] = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type !== 'transaction') {
      return;
    }

    for (let j = 1; j < item.length; j++) {
      const event = item[j] as Event;

      if (event && event.contexts && event.contexts['profile'] && event.contexts['profile']['profile_id']) {
        events.push(item[j] as Event);
      }
    }
  });

  return events;
}

const debugIdStackParserCache = new WeakMap<StackParser, Map<string, StackFrame[]>>();
/**
 * Applies debug meta data to an event from a list of paths to resources (sourcemaps)
 */
export function applyDebugMetadata(resource_paths: ReadonlyArray<string>): DebugImage[] {
  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;

  if (!debugIdMap) {
    return [];
  }

  const hub = getCurrentHub();
  if (!hub) {
    return [];
  }
  const client = hub.getClient();
  if (!client) {
    return [];
  }
  const options = client.getOptions();
  if (!options) {
    return [];
  }
  const stackParser = options.stackParser;
  if (!stackParser) {
    return [];
  }

  let debugIdStackFramesCache: Map<string, StackFrame[]>;
  const cachedDebugIdStackFrameCache = debugIdStackParserCache.get(stackParser);
  if (cachedDebugIdStackFrameCache) {
    debugIdStackFramesCache = cachedDebugIdStackFrameCache;
  } else {
    debugIdStackFramesCache = new Map<string, StackFrame[]>();
    debugIdStackParserCache.set(stackParser, debugIdStackFramesCache);
  }

  // Build a map of filename -> debug_id
  const filenameDebugIdMap = Object.keys(debugIdMap).reduce<Record<string, string>>((acc, debugIdStackTrace) => {
    let parsedStack: StackFrame[];

    const cachedParsedStack = debugIdStackFramesCache.get(debugIdStackTrace);
    if (cachedParsedStack) {
      parsedStack = cachedParsedStack;
    } else {
      parsedStack = stackParser(debugIdStackTrace);
      debugIdStackFramesCache.set(debugIdStackTrace, parsedStack);
    }

    for (let i = parsedStack.length - 1; i >= 0; i--) {
      const stackFrame = parsedStack[i];
      const file = stackFrame && stackFrame.filename;

      if (stackFrame && file) {
        acc[file] = debugIdMap[debugIdStackTrace] as string;
        break;
      }
    }
    return acc;
  }, {});

  const images: DebugImage[] = [];
  for (const path of resource_paths) {
    if (path && filenameDebugIdMap[path]) {
      images.push({
        type: 'sourcemap',
        code_file: path,
        debug_id: filenameDebugIdMap[path] as string,
      });
    }
  }

  return images;
}

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 */
export function isValidSampleRate(rate: unknown): boolean {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  if ((typeof rate !== 'number' && typeof rate !== 'boolean') || (typeof rate === 'number' && isNaN(rate))) {
    __DEBUG_BUILD__ &&
      logger.warn(
        `[Profiling] Invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          rate,
        )} of type ${JSON.stringify(typeof rate)}.`,
      );
    return false;
  }

  // Boolean sample rates are always valid
  if (rate === true || rate === false) {
    return true;
  }

  // in case sampleRate is a boolean, it will get automatically cast to 1 if it's true and 0 if it's false
  if (rate < 0 || rate > 1) {
    __DEBUG_BUILD__ &&
      logger.warn(`[Profiling] Invalid sample rate. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

function isValidProfile(profile: JSSelfProfile): profile is JSSelfProfile & { profile_id: string } {
  if (profile.samples.length < 2) {
    if (__DEBUG_BUILD__) {
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      logger.log('[Profiling] Discarding profile because it contains less than 2 samples');
    }
    return false;
  }

  if (!profile.frames.length) {
    if (__DEBUG_BUILD__) {
      logger.log('[Profiling] Discarding profile because it contains no frames');
    }
    return false;
  }

  return true;
}

/**
 * Creates a profiling envelope item, if the profile does not pass validation, returns null.
 * @param event
 * @returns {Profile | null}
 */
export function createProfilingEvent(profile_id: string, profile: JSSelfProfile, event: ProfiledEvent): Profile | null {
  if (!isValidProfile(profile)) {
    return null;
  }

  return createProfilePayload(event, profile, profile_id);
}

export const PROFILE_MAP: Map<string, JSSelfProfile> = new Map();
/**
 *
 */
export function addProfileToMap(profile_id: string, profile: JSSelfProfile): void {
  PROFILE_MAP.set(profile_id, profile);

  if (PROFILE_MAP.size > 30) {
    const last: string = PROFILE_MAP.keys().next().value;
    PROFILE_MAP.delete(last);
  }
}
