/** Current user shape returned by GET /api/core/me/ */
export interface CurrentUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
  is_active: boolean;
  date_joined: string;
}
