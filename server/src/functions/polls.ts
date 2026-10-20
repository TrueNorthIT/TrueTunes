import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { createPollService, HttpResult, PollService } from '../shared/pollService';
import { containerPollStore } from '../shared/pollCosmosStore';
import { runPollPost } from '../shared/pollPost';
import { sendPollAnnouncement } from '../shared/vestaboard';

// Weekly anonymous poll. Answers carry only {pollId, choice}: nothing about the caller is read,
// stored or logged here, and the chosen answer is never logged. Admin routes are honour-system.

const headers = { 'Access-Control-Allow-Origin': '*' };

let cachedStore: ReturnType<typeof containerPollStore> | undefined;
let cachedService: PollService | undefined;

function getStore(): ReturnType<typeof containerPollStore> | undefined {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  if (!connStr) return undefined;
  if (!cachedStore) {
    const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
    const ctrName = process.env['COSMOS_POLLS_CONTAINER'] ?? 'polls';
    cachedStore = containerPollStore(new CosmosClient(connStr).database(dbName).container(ctrName));
  }
  return cachedStore;
}

function getService(): PollService | undefined {
  const store = getStore();
  if (!store) return undefined;
  cachedService ??= createPollService({ store, now: () => Date.now() });
  return cachedService;
}

async function readBody(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function run(
  name: string,
  context: InvocationContext,
  call: (service: PollService) => Promise<HttpResult>,
): Promise<HttpResponseInit> {
  const service = getService();
  if (!service) return { status: 500, jsonBody: { error: 'Cosmos not configured' }, headers };
  try {
    const { status, body } = await call(service);
    return { status, jsonBody: body, headers };
  } catch (err: unknown) {
    context.error(`[${name}] failed:`, err);
    return { status: 500, jsonBody: { error: 'Poll request failed' }, headers };
  }
}

export const pollsListHandler = (_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> =>
  run('polls', context, (s) => s.listLive());

export const pollsAnswerHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const body = await readBody(request);
  return run('polls-answer', context, (s) => s.answer(body));
};

export const pollsAdminListHandler = (_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> =>
  run('polls-admin', context, (s) => s.adminList());

export const pollsAdminCreateHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const body = await readBody(request);
  return run('polls-admin-create', context, (s) => s.create(body));
};

export const pollsAdminUpdateHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const body = await readBody(request);
  return run('polls-admin-update', context, (s) => s.update(request.params['id'] ?? '', body));
};

export const pollsAdminDeleteHandler = (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> =>
  run('polls-admin-delete', context, (s) => s.remove(request.params['id'] ?? ''));

export const pollsAdminReorderHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
  const body = await readBody(request);
  return run('polls-admin-reorder', context, (s) => s.reorder(body));
};

export async function pollPostTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  const store = getStore();
  if (!store) {
    context.warn('[polls-post] Cosmos not configured');
    return;
  }
  const result = await runPollPost({
    store,
    now: () => Date.now(),
    post: (board) => sendPollAnnouncement(board, (msg, ...args) => context.log(msg, ...args)),
    log: (msg, ...args) => context.log(msg, ...args),
  });
  if (result.posted) context.log(`[polls-post] posted poll ${result.pollId}`);
}

app.http('polls', { methods: ['GET'], route: 'polls', authLevel: 'anonymous', handler: pollsListHandler });
app.http('polls-answer', { methods: ['POST'], route: 'polls/answer', authLevel: 'anonymous', handler: pollsAnswerHandler });
app.http('polls-admin-list', { methods: ['GET'], route: 'polls-admin', authLevel: 'anonymous', handler: pollsAdminListHandler });
app.http('polls-admin-create', { methods: ['POST'], route: 'polls-admin', authLevel: 'anonymous', handler: pollsAdminCreateHandler });
app.http('polls-admin-reorder', { methods: ['POST'], route: 'polls-admin/reorder', authLevel: 'anonymous', handler: pollsAdminReorderHandler });
app.http('polls-admin-update', { methods: ['PUT'], route: 'polls-admin/{id}', authLevel: 'anonymous', handler: pollsAdminUpdateHandler });
app.http('polls-admin-delete', { methods: ['DELETE'], route: 'polls-admin/{id}', authLevel: 'anonymous', handler: pollsAdminDeleteHandler });

// Fires at 10:23 and 11:23 UTC on weekdays; shouldPostPoll lets only the 11:23 Europe/London one through.
app.timer('polls-post-timer', {
  schedule: '0 23 10,11 * * 1-5',
  handler: pollPostTimer,
});
