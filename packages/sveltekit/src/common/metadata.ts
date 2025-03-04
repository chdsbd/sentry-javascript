import { SDK_VERSION } from '@sentry/core';
import type { Options, SdkInfo } from '@sentry/types';

const PACKAGE_NAME_PREFIX = 'npm:@sentry/';

/**
 * A builder for the SDK metadata in the options for the SDK initialization.
 *
 * Note: This function is identical to `buildMetadata` in Remix and NextJS.
 * We don't extract it for bundle size reasons.
 * If you make changes to this function consider updating the othera as well.
 *
 * @param options SDK options object that gets mutated
 * @param names list of package names
 */
export function applySdkMetadata(options: Options, names: string[]): void {
  options._metadata = options._metadata || {};
  options._metadata.sdk =
    options._metadata.sdk ||
    ({
      name: 'sentry.javascript.sveltekit',
      packages: names.map(name => ({
        name: `${PACKAGE_NAME_PREFIX}${name}`,
        version: SDK_VERSION,
      })),
      version: SDK_VERSION,
    } as SdkInfo);
}
