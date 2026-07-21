// Quick test to verify SDK works
import { ContextRouter } from '../packages/sdk-typescript/dist/index.js';

const router = await ContextRouter.local();
const flow = await router.start('Test');
await flow.set('test', { value: 42 });
const result = await flow.get('test');
console.log('Result:', result);
await flow.complete();
await router.close();
console.log('SUCCESS');
