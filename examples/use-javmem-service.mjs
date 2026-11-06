// An example DSH plugin that uses javmem-dsh-plugin's service (ctx.javmem) to look into one Bot's memory without a
// model: before a guard-like check, it asks whether that Bot's memory knows a word. The service answers with the same
// text as the Bot's own memory tools, for that Bot's own store, token and profile only.
//
// Mount it after javmem-dsh-plugin, with { bot: '<Bot id>', word: '<something to look for>' } as its config. It only
// runs while the javmem service is there (ctx.inject waits for it).
export const name = 'javmem-service-example';

export function apply(ctx, config = {}) {
  ctx.inject(['javmem'], async (scope) => {
    const { javmem } = scope;
    const listed = javmem.bots().map((b) => b.slug);
    if (!config.bot || !listed.includes(config.bot)) {
      scope.logger?.('javmem-example')?.info?.(`not a listed Bot: ${config.bot}`);
      return;
    }
    // recall takes a sentence; search takes keywords; ask reaches any tool of the Bot's store by its own name.
    const remembered = await javmem.search(config.bot, config.word || '体检', { limit: 3 });
    const known = !/没有找到/.test(remembered);
    // Only a yes or no leaves here: what a memory says belongs to the Bot's own conversation.
    scope.logger?.('javmem-example')?.info?.(`memory of ${config.bot} knows "${config.word}": ${known}`);
    config.onResult?.(known);
  });
}
