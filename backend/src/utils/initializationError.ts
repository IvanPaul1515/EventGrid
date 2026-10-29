/** Only deliberately authored, value-free diagnostics may be written during private initialization. */
export class InitializationError extends Error {}
export function initializationDiagnostic(error:unknown){
 return error instanceof InitializationError?error.message:'Private initialization failed. Verify database access and local configuration. Credentials were not logged.';
}
