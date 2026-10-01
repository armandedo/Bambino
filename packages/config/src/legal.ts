import type { ConsentType } from '@bambino/types';

/**
 * Current version of each document a customer agrees to. Registration requires the
 * customer to have accepted exactly these versions, and the accepted version is
 * stored in consent_records. PLACEHOLDER: the legal texts have not been written yet.
 */
export const LEGAL_DOCUMENT_VERSIONS: Record<ConsentType, string> = {
  TERMS_OF_SERVICE: 'draft-1',
  PRIVACY_POLICY: 'draft-1',
  CHILD_DATA_PROCESSING: 'draft-1',
  MARKETING: 'draft-1',
};
