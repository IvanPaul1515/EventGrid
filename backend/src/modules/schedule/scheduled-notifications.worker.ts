// Scheduled records are retained for review. A stored schedule is not fresh
// authorization to send mail after startup, restart, or provider activation.
// Explicit notification actions continue through CommunicationsService.
export class ScheduledNotificationsWorker {
  static start() {}
  static stop() {}
  static async processPending() {}
  static async processMaturedNotifications() {}
}
