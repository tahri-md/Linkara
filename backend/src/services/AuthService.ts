import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import type { StringValue } from "ms";
import { query } from "../db/connection.js";
import type { User, UserInput, UserPublic, AuthToken } from "../models/User.js";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET environment variable is not set. " +
      "Set a strong random value before starting the server.",
    );
  }
  return secret;
}

const JWT_EXPIRATION: StringValue | number = (process.env.JWT_EXPIRATION ||
  "24h") as StringValue;

export class AuthService {
  static async register(input: UserInput): Promise<AuthToken> {
    const { email, password, name } = input;

    const existing = await query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      throw new Error("Email already registered");
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (email, password_hash, name, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, name, avatar_url, created_at`,
      [email, password_hash, name || null],
    );

    const user = result.rows[0] as UserPublic;
    const token = this.generateToken(user.id);

    return { token, user };
  }

  static async login(email: string, password: string): Promise<AuthToken> {
    const result = await query(
      "SELECT id, email, password_hash, name, avatar_url, created_at FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      throw new Error("Invalid email or password");
    }

    const user = result.rows[0] as User;
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      throw new Error("Invalid email or password");
    }

    const publicUser: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    };

    const token = this.generateToken(user.id);
    return { token, user: publicUser };
  }

  static async verifyToken(token: string): Promise<string> {
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
      return decoded.userId;
    } catch (err) {
      throw new Error("Invalid or expired token");
    }
  }

  static generateToken(userId: string): string {
    const options: SignOptions = { expiresIn: JWT_EXPIRATION };
    return jwt.sign({ userId }, getJwtSecret(), options);
  }

  static async getUserById(userId: string): Promise<UserPublic | null> {
    const result = await query(
      "SELECT id, email, name, avatar_url, created_at FROM users WHERE id = $1",
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as UserPublic;
  }
  static async getUserByEmail(email: string): Promise<UserPublic | null> {
    const result = await query(
      `SELECT id, email, name, avatar_url, created_at FROM users WHERE email = $1 LIMIT 1`,
      [email],
    );
    return result.rows.length > 0 ? (result.rows[0] as UserPublic) : null;
  }
}
