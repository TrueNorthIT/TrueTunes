import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { verifyBearer } from '@/lib/oauth/server';
import { INSTRUCTIONS, registerTools } from '@/lib/tools';

export const maxDuration = 60;

const handler = createMcpHandler((server) => registerTools(server), {
  serverInfo: { name: 'truetunes', version: '0.1.0' },
  instructions: INSTRUCTIONS,
});

const authed = withMcpAuth(handler, verifyBearer, {
  required: true,
  resourceMetadataPath: '/.well-known/oauth-protected-resource/mcp',
});

export { authed as GET, authed as POST, authed as DELETE };
