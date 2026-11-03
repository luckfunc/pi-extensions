import pstack from '../extensions/pstack-mode.ts';
export default function(pi: any) {
  let task: any;
  pstack(new Proxy(pi, {get(target, key) {
    if (key === 'registerTool') return (definition: any) => { if(definition.name === 'task') task = definition; return target.registerTool(definition); };
    return Reflect.get(target, key);
  }}));
  pi.registerCommand('test-pstack-cancel', {
    description: 'Start a local fake task for Esc verification; no model call',
    handler: async (_args: string, ctx: any) => {
      const reply = await task.execute('tui-test', {prompt:'console.log("fixture ready");setInterval(()=>{},1000)'}, undefined, undefined, ctx);
      ctx.ui.notify(reply.content[0].text, 'info');
    },
  });
}
