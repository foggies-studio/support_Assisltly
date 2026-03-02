export interface BotConfig {
  token: string;
  adminChatId: string;
  adminIds: Set<number>;
  supportName: string;
}

export interface TicketMeta {
  ticketId: string;
  userId: number;
  username?: string;
  firstName?: string;
  createdAtIso: string;
  startPayload?: string;
}
