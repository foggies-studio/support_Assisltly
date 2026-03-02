import { Telegraf } from "telegraf";
import { addBan, getBans, removeBan } from "./bans";
import { BotConfig } from "./types";

function parseUserId(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }

  return value;
}

function isAdmin(userId: number | undefined, adminIds: Set<number>): boolean {
  return typeof userId === "number" && adminIds.has(userId);
}

export function registerAdminHandlers(bot: Telegraf, config: BotConfig): void {
  bot.command("reply", async (ctx) => {
    try {
      if (!isAdmin(ctx.from?.id, config.adminIds)) {
        await ctx.reply("⛔️ Нет доступа.");
        return;
      }

      const text = (ctx.message as { text?: string } | undefined)?.text ?? "";
      const payload = text.replace(/^\/reply(@\w+)?\s*/i, "").trim();
      const firstSpaceIndex = payload.indexOf(" ");

      if (!payload || firstSpaceIndex === -1) {
        await ctx.reply("Использование: /reply <userId> <text>");
        return;
      }

      const rawUserId = payload.slice(0, firstSpaceIndex).trim();
      const replyText = payload.slice(firstSpaceIndex + 1).trim();
      const userId = parseUserId(rawUserId);

      if (!userId || !replyText) {
        await ctx.reply("Использование: /reply <userId> <text>");
        return;
      }

      await ctx.telegram.sendMessage(userId, replyText);
      await ctx.reply(`✅ Отправлено пользователю ${userId}`);
      console.log(`[support-bot] reply sent by admin=${ctx.from?.id} to user=${userId}`);
    } catch (error) {
      console.error("[support-bot] /reply error", error);
      await ctx.reply("Не удалось отправить сообщение пользователю.");
    }
  });

  bot.command("ban", async (ctx) => {
    try {
      if (!isAdmin(ctx.from?.id, config.adminIds)) {
        await ctx.reply("⛔️ Нет доступа.");
        return;
      }

      const text = (ctx.message as { text?: string } | undefined)?.text ?? "";
      const rawUserId = text.replace(/^\/ban(@\w+)?\s*/i, "").trim();
      const userId = parseUserId(rawUserId);

      if (!userId) {
        await ctx.reply("Использование: /ban <userId>");
        return;
      }

      await addBan(userId);
      await ctx.reply(`✅ Пользователь ${userId} забанен.`);
      console.log(`[support-bot] ban user=${userId} by admin=${ctx.from?.id}`);
    } catch (error) {
      console.error("[support-bot] /ban error", error);
      await ctx.reply("Не удалось выполнить бан.");
    }
  });

  bot.command("unban", async (ctx) => {
    try {
      if (!isAdmin(ctx.from?.id, config.adminIds)) {
        await ctx.reply("⛔️ Нет доступа.");
        return;
      }

      const text = (ctx.message as { text?: string } | undefined)?.text ?? "";
      const rawUserId = text.replace(/^\/unban(@\w+)?\s*/i, "").trim();
      const userId = parseUserId(rawUserId);

      if (!userId) {
        await ctx.reply("Использование: /unban <userId>");
        return;
      }

      await removeBan(userId);
      await ctx.reply(`✅ Пользователь ${userId} разбанен.`);
      console.log(`[support-bot] unban user=${userId} by admin=${ctx.from?.id}`);
    } catch (error) {
      console.error("[support-bot] /unban error", error);
      await ctx.reply("Не удалось выполнить разбан.");
    }
  });

  bot.command("bans", async (ctx) => {
    try {
      if (!isAdmin(ctx.from?.id, config.adminIds)) {
        await ctx.reply("⛔️ Нет доступа.");
        return;
      }

      const bans = [...(await getBans())].sort((a, b) => a - b);
      if (bans.length === 0) {
        await ctx.reply("Список банов пуст.");
        return;
      }

      const list = bans.map((id) => `• ${id}`).join("\n");
      await ctx.reply(`Забаненные пользователи:\n${list}`);
    } catch (error) {
      console.error("[support-bot] /bans error", error);
      await ctx.reply("Не удалось получить список банов.");
    }
  });
}
