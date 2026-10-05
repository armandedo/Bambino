import type { ErrorReporter } from '@bambino/utils';
import type { Logger } from '../infra/logger';
import type { Loaders } from './loaders';
import type { ServiceContext } from '../services/context';
import type { Services } from '../services';
import type { CookieJar } from '../server/cookies';

/**
 * `web` clients authenticate with httpOnly cookies; `mobile` clients with a bearer
 * token and receive refresh tokens in the response body.
 */
export type ClientKind = 'web' | 'mobile';

export interface GraphQLContext extends ServiceContext {
  readonly services: Services;
  readonly client: ClientKind;
  readonly cookies: CookieJar;
  readonly logger: Logger;
  readonly errorReporter: ErrorReporter;
  readonly marketCode: string;
  readonly loaders: Loaders;
}
