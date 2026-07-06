/** Types for the users mod. */

/** Current user shape returned by GET /api/core/me/ and /api/core/users/ */
export interface CurrentUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
  is_active: boolean;
  date_joined: string;
}

/** CoreSetting shape returned by /api/core/settings/{key}/ */
export interface CoreSetting {
  id: number;
  key: string;
  value: unknown;
}
