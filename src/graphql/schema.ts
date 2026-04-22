import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const userSchema = readFileSync(resolve(__dirname, './types/user.graphql'), 'utf-8');
const organizationSchema = readFileSync(resolve(__dirname, './types/organization.graphql'), 'utf-8');

export const typeDefs = `
  ${userSchema}
  ${organizationSchema}
`;

export interface Context {
  userId?: string;
}
