import { Markup, Telegraf } from "telegraf";
import dotenv from "dotenv";
import { ensureBansFile, getBans, isBanned } from "./bans";
import { UserRateLimiter } from "./rateLimit";
import { registerAdminHandlers } from "./admin";
import { BotConfig, TicketMeta } from "./types";

dotenv.config();

const supportName = process.env.SUPPORT_NAME?.trim() || "Support Assistly";
const token = process.env.SUPPORT_BOT_TOKEN?.trim();
const adminChatId = process.env.ADMIN_CHAT_ID?.trim();
const adminIdsRaw = process.env.ADMIN_IDS?.trim() || "";

if (!token) {
  throw new Error("SUPPORT_BOT_TOKEN is required in .env");
}
if (!adminChatId) {
  throw new Error("ADMIN_CHAT_ID is required in .env");
}

const adminIds = new Set(
  adminIdsRaw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
);

const config: BotConfig = {
  token,
  adminChatId,
  adminIds,
  supportName
};

const bot = new Telegraf(config.token);
const rateLimiter = new UserRateLimiter(20_000);
const awaitingTicketMessage = new Set<number>();
const userStartPayload = new Map<number, string>();
const pendingAdminReplyTarget = new Map<number, number>();

let lastTicketNumericId = 0;

const userCommands = [
  { command: "start", description: "Запуск бота и показ панели" }
];

const adminCommands = [
  { command: "start", description: "Запуск бота и показ панели" },
  { command: "reply", description: "Ответ пользователю: /reply <userId> <text>" },
  { command: "ban", description: "Забанить пользователя: /ban <userId>" },
  { command: "unban", description: "Разбанить пользователя: /unban <userId>" },
  { command: "bans", description: "Список забаненных пользователей" }
];

function isAdmin(userId: number | undefined): boolean {
  return typeof userId === "number" && config.adminIds.has(userId);
}

function isCommandMessage(text: string | undefined): boolean {
  return Boolean(text && text.trim().startsWith("/"));
}

function makeTicketId(): string {
  const now = Date.now();
  if (now <= lastTicketNumericId) {
    lastTicketNumericId += 1;
  } else {
    lastTicketNumericId = now;
  }

  return String(lastTicketNumericId);
}

function extractStartPayload(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  const payload = text.replace(/^\/start(@\w+)?\s*/i, "").trim();
  return payload || undefined;
}

function supportKeyboard() {
  return Markup.keyboard([["✍️ Написать в поддержку"], ["ℹ️ Как описать проблему"]]).resize();
}

function adminKeyboard() {
  return Markup.keyboard([["🛠 Панель ответов", "❌ Отмена ответа"], ["📋 Список банов"]]).resize();
}

async function sendMetaToAdmin(ctx: any, meta: TicketMeta): Promise<void> {
  const usernameText = meta.username ? `@${meta.username}` : "-";
  const payloadText = meta.startPayload ?? "-";
  const dateText = new Date(meta.createdAtIso).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow"
  });

  const text = [
    "🧾 Новое обращение",
    `ticketId: ${meta.ticketId}`,
    `userId: ${meta.userId}`,
    `username: ${usernameText}`,
    `first_name: ${meta.firstName ?? "-"}`,
    `дата/время: ${dateText}`,
    `startPayload: ${payloadText}`
  ].join("\n");

  await ctx.telegram.sendMessage(
    config.adminChatId,
    text,
    Markup.inlineKeyboard([
      Markup.button.callback("✉️ Ответить пользователю", `reply_to_user:${meta.userId}`)
    ])
  );
}

registerAdminHandlers(bot, config);

bot.start(async (ctx) => {
  try {
    const payload = extractStartPayload((ctx.message as { text?: string } | undefined)?.text);
    const userId = ctx.from?.id;

    if (!userId) {
      return;
    }

    if (isAdmin(userId)) {
      await ctx.reply(
        [
          "🛠 Админ-панель поддержки.",
          "Новые обращения приходят в этот чат с кнопкой \"Ответить пользователю\".",
          "Также доступна команда: /reply <userId> <text>"
        ].join("\n"),
        adminKeyboard()
      );
      return;
    }

    if (payload) {
      userStartPayload.set(userId, payload);
    }

    const lines = [
      `👋 Это ${config.supportName}. Здесь можно сообщить о проблеме или задать вопрос.`
    ];

    if (payload) {
      lines.push(`Источник: ${payload}`);
    }

    await ctx.reply(lines.join("\n"), supportKeyboard());
  } catch (error) {
    console.error("[support-bot] /start error", error);
  }
});

bot.hears("🛠 Панель ответов", async (ctx) => {
  try {
    if (!isAdmin(ctx.from?.id)) {
      return;
    }

    await ctx.reply(
      [
        "Режим ответов администратора:",
        "1) Нажми кнопку \"✉️ Ответить пользователю\" под нужным обращением.",
        "2) Отправь следующее сообщение в этот чат - оно уйдет пользователю.",
        "3) Для отмены нажми \"❌ Отмена ответа\"."
      ].join("\n"),
      adminKeyboard()
    );
  } catch (error) {
    console.error("[support-bot] admin panel info error", error);
  }
});

bot.hears("❌ Отмена ответа", async (ctx) => {
  try {
    const adminId = ctx.from?.id;
    if (!isAdmin(adminId)) {
      return;
    }

    pendingAdminReplyTarget.delete(adminId);
    await ctx.reply("Ок, режим ответа сброшен.", adminKeyboard());
  } catch (error) {
    console.error("[support-bot] cancel admin reply mode error", error);
  }
});

bot.hears("📋 Список банов", async (ctx) => {
  try {
    const adminId = ctx.from?.id;
    if (!isAdmin(adminId)) {
      return;
    }

    const bans = [...(await getBans())].sort((a, b) => a - b);
    if (bans.length === 0) {
      await ctx.reply("Список банов пуст.", adminKeyboard());
      return;
    }

    const list = bans.map((id) => `• ${id}`).join("\n");
    await ctx.reply(`Забаненные пользователи:\n${list}`, adminKeyboard());
  } catch (error) {
    console.error("[support-bot] admin bans list error", error);
  }
});

bot.action(/^reply_to_user:(\d+)$/, async (ctx) => {
  try {
    const adminId = ctx.from?.id;
    if (!isAdmin(adminId)) {
      await ctx.answerCbQuery("Нет доступа", { show_alert: true });
      return;
    }

    const userId = Number(ctx.match[1]);
    if (!Number.isInteger(userId) || userId <= 0) {
      await ctx.answerCbQuery("Некорректный userId", { show_alert: true });
      return;
    }

    pendingAdminReplyTarget.set(adminId, userId);
    await ctx.answerCbQuery("Режим ответа включен");
    await ctx.reply(
      `✉️ Следующее сообщение отправлю пользователю ${userId}.`,
      adminKeyboard()
    );
  } catch (error) {
    console.error("[support-bot] reply action error", error);
  }
});

bot.hears("ℹ️ Как описать проблему", async (ctx) => {
  try {
    if (isAdmin(ctx.from?.id)) {
      return;
    }

    await ctx.reply(
      [
        "Чеклист для обращения:",
        "• что хотели сделать",
        "• что получилось",
        "• текст ошибки (если есть)",
        "• скрин/видео (если можно)",
        "• модель устройства/ОС (если важно)"
      ].join("\n"),
      supportKeyboard()
    );
  } catch (error) {
    console.error("[support-bot] checklist error", error);
  }
});

bot.hears("✍️ Написать в поддержку", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId || isAdmin(userId)) {
      return;
    }

    if (await isBanned(userId)) {
      await ctx.reply("⛔️ Вы не можете писать в поддержку.");
      return;
    }

    awaitingTicketMessage.add(userId);
    await ctx.reply(
      "Ок, пришли одним сообщением описание проблемы. Можно прикрепить фото/файл.",
      supportKeyboard()
    );
  } catch (error) {
    console.error("[support-bot] write-to-support button error", error);
  }
});

bot.on("message", async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const text = (ctx.message as { text?: string } | undefined)?.text;

    if (isAdmin(userId)) {
      const replyTargetId = pendingAdminReplyTarget.get(userId);
      if (!replyTargetId || isCommandMessage(text)) {
        return;
      }

      try {
        await ctx.telegram.copyMessage(replyTargetId, ctx.chat.id, ctx.message.message_id);
      } catch (copyError) {
        console.error("[support-bot] admin copyMessage failed, trying forwardMessage", copyError);
        await ctx.telegram.forwardMessage(replyTargetId, ctx.chat.id, ctx.message.message_id);
      }

      pendingAdminReplyTarget.delete(userId);
      await ctx.reply(`✅ Отправлено пользователю ${replyTargetId}`, adminKeyboard());
      console.log(`[support-bot] reply sent by admin=${userId} to user=${replyTargetId}`);
      return;
    }

    const chatType = ctx.chat?.type;
    if (chatType !== "private") {
      return;
    }

    if (await isBanned(userId)) {
      await ctx.reply("⛔️ Вы не можете писать в поддержку.");
      return;
    }

    if (!awaitingTicketMessage.has(userId)) {
      return;
    }

    const rateLimit = rateLimiter.check(userId);
    if (!rateLimit.allowed) {
      await ctx.reply("Слишком часто. Подожди немного и попробуй снова.");
      return;
    }

    awaitingTicketMessage.delete(userId);

    const ticketId = makeTicketId();
    const createdAtIso = new Date().toISOString();
    const meta: TicketMeta = {
      ticketId,
      userId,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      createdAtIso,
      startPayload: userStartPayload.get(userId)
    };

    try {
      await ctx.telegram.copyMessage(config.adminChatId, ctx.chat.id, ctx.message.message_id);
    } catch (copyError) {
      console.error("[support-bot] copyMessage failed, trying forwardMessage", copyError);
      try {
        await ctx.telegram.forwardMessage(config.adminChatId, ctx.chat.id, ctx.message.message_id);
      } catch (forwardError) {
        console.error("[support-bot] forwardMessage failed", forwardError);
        await ctx.telegram.sendMessage(
          config.adminChatId,
          `Не удалось переслать сообщение пользователя ${userId}. ticketId=${ticketId}`
        );
      }
    }

    await sendMetaToAdmin(ctx, meta);
    await ctx.reply("✅ Обращение принято. Мы ответим здесь.");

    console.log(
      `[support-bot] new ticket ticketId=${ticketId} userId=${userId} chat=${ctx.chat.id}`
    );
  } catch (error) {
    console.error("[support-bot] message handler error", error);
    try {
      await ctx.reply("Произошла ошибка. Попробуй отправить обращение ещё раз.");
    } catch {
      // ignore secondary reply failures
    }
  }
});

bot.catch((error, ctx) => {
  console.error("[support-bot] unhandled error", error, {
    updateId: ctx.update.update_id,
    from: ctx.from?.id
  });
});

async function setupCommands(): Promise<void> {
  await bot.telegram.setMyCommands(userCommands);

  for (const adminId of config.adminIds) {
    try {
      await bot.telegram.setMyCommands(adminCommands, {
        scope: { type: "chat", chat_id: adminId }
      });
    } catch (error) {
      console.error(`[support-bot] failed to set admin commands for ${adminId}`, error);
    }
  }
}

async function bootstrap(): Promise<void> {
  await ensureBansFile();
  await bot.launch();
  await setupCommands();
  console.log(`[support-bot] started as ${config.supportName}`);
}

void bootstrap().catch((error) => {
  console.error("[support-bot] startup error", error);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
