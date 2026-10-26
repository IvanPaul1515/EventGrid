export function safeCommunicationError(error: unknown, canView: boolean) {
    if (!canView || !error)
        return null;
    const code = String(error).match(/\b(EAUTH|ETIMEDOUT|ECONNRESET|ENOTFOUND|EENVELOPE|ECONNECTION)\b/)?.[0];
    return 'No se completó la comunicación. ' + (code || 'Revise el proveedor antes de autorizar otro intento.');
}
