import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('.', import.meta.url)), test: { fileParallelism: false, setupFiles: ['backend/tests/safety-guard.ts'], include: ['backend/tests/manual_registration_courtesy.test.ts', 'backend/tests/roles_sponsors_qr.test.ts', 'backend/tests/email_manual_authorization.test.ts', 'backend/tests/reception-safety.test.ts', 'backend/tests/evolution_security.test.ts', 'backend/tests/write-transaction.test.ts'] } });
