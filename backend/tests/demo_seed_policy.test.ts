import {describe,it,expect} from 'vitest';
import {demoSeedAllowed} from '../prisma/demo-seed-policy.js';
describe('explicit isolated demo seeding',()=>{
 it('never seeds demo accounts automatically on a normal install or production restart',()=>{expect(demoSeedAllowed({})).toBe(false);expect(demoSeedAllowed({NODE_ENV:'production'})).toBe(false);expect(demoSeedAllowed({DEMO_QUICK_ACCESS:'false'})).toBe(false);expect(demoSeedAllowed({DEMO_QUICK_ACCESS:'TRUE'})).toBe(false);});
 it('preserves explicit demo activation, including the existing Render demo',()=>{expect(demoSeedAllowed({NODE_ENV:'production',DEMO_QUICK_ACCESS:'true'})).toBe(true);});
});
