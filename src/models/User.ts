export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  avatar_url: string | null;
  github_id: string | null;
  github_token: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserInput {
  email: string;
  password: string;
  name?: string;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: Date;
}

export interface AuthToken {
  token: string;
  user: UserPublic;
}