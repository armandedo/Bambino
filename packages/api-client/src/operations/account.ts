import { operation } from '../client';

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  countryCode: string;
  region: string | null;
  district: string | null;
  sector: string | null;
  street: string | null;
  directions: string | null;
  isDefault: boolean;
}

export interface Viewer {
  id: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  firstName: string;
  lastName: string;
  preferredLocale: string;
  roles: string[];
  permissions: string[];
  addresses: Address[];
}

const ADDRESS_FIELDS =
  'id label recipientName phone countryCode region district sector street directions isDefault';
const VIEWER_FIELDS = `id email emailVerified phone firstName lastName preferredLocale roles permissions addresses { ${ADDRESS_FIELDS} }`;

export const MeQuery = operation<{ me: Viewer | null }>('Me', `query Me { me { ${VIEWER_FIELDS} } }`);

export interface AuthPayload {
  user: Viewer;
  accessToken: string | null;
  accessTokenExpiresAt: string;
  refreshToken: string | null;
}
const AUTH_FIELDS = `user { ${VIEWER_FIELDS} } accessToken accessTokenExpiresAt refreshToken`;

export type ConsentType = 'TERMS_OF_SERVICE' | 'PRIVACY_POLICY' | 'CHILD_DATA_PROCESSING' | 'MARKETING';
export interface ConsentInput {
  type: ConsentType;
  documentVersion: string;
  granted: boolean;
}

export const RegisterMutation = operation<
  { register: AuthPayload },
  {
    input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string | null;
      consents: ConsentInput[];
    };
  }
>('Register', `mutation Register($input: RegisterInput!) { register(input: $input) { ${AUTH_FIELDS} } }`);

export const LoginMutation = operation<
  { login: AuthPayload },
  { input: { email: string; password: string } }
>('Login', `mutation Login($input: LoginInput!) { login(input: $input) { ${AUTH_FIELDS} } }`);

export const RefreshSessionMutation = operation<
  { refreshSession: AuthPayload },
  { refreshToken?: string | null }
>(
  'RefreshSession',
  `mutation RefreshSession($refreshToken: String) { refreshSession(refreshToken: $refreshToken) { ${AUTH_FIELDS} } }`,
);

export const LogoutMutation = operation<{ logout: boolean }, { refreshToken?: string | null }>(
  'Logout',
  'mutation Logout($refreshToken: String) { logout(refreshToken: $refreshToken) }',
);

export const RequestPasswordResetMutation = operation<{ requestPasswordReset: boolean }, { email: string }>(
  'RequestPasswordReset',
  'mutation RequestPasswordReset($email: String!) { requestPasswordReset(email: $email) }',
);

export const ResetPasswordMutation = operation<
  { resetPassword: boolean },
  { token: string; newPassword: string }
>(
  'ResetPassword',
  'mutation ResetPassword($token: String!, $newPassword: String!) { resetPassword(token: $token, newPassword: $newPassword) }',
);

export const ChangePasswordMutation = operation<
  { changePassword: boolean },
  { currentPassword: string; newPassword: string }
>(
  'ChangePassword',
  'mutation ChangePassword($currentPassword: String!, $newPassword: String!) { changePassword(currentPassword: $currentPassword, newPassword: $newPassword) }',
);

export const RequestEmailVerificationMutation = operation<{ requestEmailVerification: boolean }>(
  'RequestEmailVerification',
  'mutation RequestEmailVerification { requestEmailVerification }',
);

export const VerifyEmailMutation = operation<{ verifyEmail: boolean }, { token: string }>(
  'VerifyEmail',
  'mutation VerifyEmail($token: String!) { verifyEmail(token: $token) }',
);

export const UpdateProfileMutation = operation<
  { updateProfile: Viewer },
  { input: { firstName?: string | null; lastName?: string | null; phone?: string | null } }
>(
  'UpdateProfile',
  `mutation UpdateProfile($input: UpdateProfileInput!) { updateProfile(input: $input) { ${VIEWER_FIELDS} } }`,
);

export interface AddressInput {
  label?: string | null;
  recipientName: string;
  phone: string;
  countryCode: string;
  region?: string | null;
  district?: string | null;
  sector?: string | null;
  street?: string | null;
  directions?: string | null;
  isDefault?: boolean | null;
}

export const CreateAddressMutation = operation<{ createAddress: Address }, { input: AddressInput }>(
  'CreateAddress',
  `mutation CreateAddress($input: AddressInput!) { createAddress(input: $input) { ${ADDRESS_FIELDS} } }`,
);

export const UpdateAddressMutation = operation<
  { updateAddress: Address },
  { id: string; input: AddressInput }
>(
  'UpdateAddress',
  `mutation UpdateAddress($id: ID!, $input: AddressInput!) { updateAddress(id: $id, input: $input) { ${ADDRESS_FIELDS} } }`,
);

export const DeleteAddressMutation = operation<{ deleteAddress: boolean }, { id: string }>(
  'DeleteAddress',
  'mutation DeleteAddress($id: ID!) { deleteAddress(id: $id) }',
);

export interface DataRequest {
  id: string;
  type: 'EXPORT' | 'DELETION';
  status: 'REQUESTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  requestedAt: string;
  completedAt: string | null;
  /** Exports only: the file can be downloaded (see DataExportDownloadQuery). */
  downloadAvailable: boolean;
  expiresAt: string | null;
}
const DATA_REQUEST_FIELDS = 'id type status requestedAt completedAt downloadAvailable expiresAt';

/** A short-lived signed link to one of the customer's completed exports. */
export const DataExportDownloadQuery = operation<
  { dataExportDownload: { url: string; expiresAt: string } },
  { id: string }
>(
  'DataExportDownload',
  'query DataExportDownload($id: ID!) { dataExportDownload(id: $id) { url expiresAt } }',
);

export const MyDataRequestsQuery = operation<{ myDataRequests: DataRequest[] }>(
  'MyDataRequests',
  `query MyDataRequests { myDataRequests { ${DATA_REQUEST_FIELDS} } }`,
);

export const RequestDataExportMutation = operation<{ requestDataExport: DataRequest }>(
  'RequestDataExport',
  `mutation RequestDataExport { requestDataExport { ${DATA_REQUEST_FIELDS} } }`,
);

export const RequestAccountDeletionMutation = operation<
  { requestAccountDeletion: DataRequest },
  { currentPassword: string }
>(
  'RequestAccountDeletion',
  `mutation RequestAccountDeletion($currentPassword: String!) { requestAccountDeletion(currentPassword: $currentPassword) { ${DATA_REQUEST_FIELDS} } }`,
);

export interface NotificationItem {
  id: string;
  type: string;
  params: { name: string; value: string }[];
  read: boolean;
  createdAt: string;
}

export const MyNotificationsQuery = operation<
  { myNotifications: { unreadCount: number; edges: { node: NotificationItem }[] } },
  { first?: number }
>(
  'MyNotifications',
  `query MyNotifications($first: Int) {
    myNotifications(first: $first) { unreadCount edges { node { id type params { name value } read createdAt } } }
  }`,
);

export const MarkAllNotificationsReadMutation = operation<{ markAllNotificationsRead: number }>(
  'MarkAllNotificationsRead',
  'mutation MarkAllNotificationsRead { markAllNotificationsRead }',
);
