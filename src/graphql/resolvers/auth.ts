import { AuthService } from '../../services/AuthService.js';
import type { UserPublic } from '../../models/User.js';

export interface Context {
  userId?: string;
}

export interface RegisterArgs {
  email: string;
  password: string;
  name?: string;
}

export interface LoginArgs {
  email: string;
  password: string;
}
export const authResolvers: any = {
  Query: {
    async me(_: any, __: any, context: Context): Promise<UserPublic | null> {
      if (!context.userId) {
        throw new Error('Authentication required');
      }
      return await AuthService.getUserById(context.userId);
    },
  },

  Mutation: {
    async register(
      _: any,
      args: RegisterArgs
    ): Promise<{ token: string; user: UserPublic }> {
      return await AuthService.register({
        email: args.email,
        password: args.password,
        name: args.name,
      });
    },

    async login(_: any, args: LoginArgs): Promise<{ token: string; user: UserPublic }> {
      return await AuthService.login(args.email, args.password);
    },
  },

  // Map snake_case DB columns → camelCase GraphQL fields
  User: {
    createdAt: (parent: any) => parent.created_at,
    avatarUrl: (parent: any) => parent.avatar_url,
  },
};