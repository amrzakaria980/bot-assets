/**
 * @file commands/Stickers/reactions-menu.js
 * @description .رياكشن — قائمة تفاعلية بكل أوامر GIF مع أزرار نسخ
 * ⦂ `𝙼𝙰𝙳𝙴 𝙱𝚈` ⥃ ╵𝙰𝙼𝚁╷
 */
import {
  generateWAMessageFromContent,
  generateWAMessageContent,
  generateMessageIDV2,
  proto,
} from "baileys";
import axios from "axios";
import { info } from "../../system/config.js";
import { claimMessage } from "../../system/subdevs.js";
import { shortErr } from "../../system/shortMsg.js";
import { withForwardBadge } from "../../system/forward.js";
import { REACTIONS } from "../../system/reactions.js";

const PREFIX = ".";

async function reactSafe(conn, m, emoji) {
  try {
    if (typeof m.react === "function") { await m.react(emoji); return; }
    if (conn?.sendMessage && m?.key) {
      await conn.sendMessage(m.chat, { react: { text: emoji, key: m.key } });
    }
  } catch {}
}

async function prepareHeaderImage(conn) {
  const imageUrl = info.images?.upload || info.images?.card || null;
  if (!imageUrl) return null;

  let imageBuffer = null;
  try {
    const { buildQualityImage } = await import("../../system/media.js");
    imageBuffer = await buildQualityImage(imageUrl, 500);
  } catch (err) {
    console.warn("[reactions-menu] buildQualityImage:", err?.message || err);
  }

  if (!imageBuffer) {
    try {
      const res = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 10_000,
        maxContentLength: 5 * 1024 * 1024,
        maxRedirects: 5,
      });
      imageBuffer = Buffer.from(res.data);
    } catch (err) {
      console.warn("[reactions-menu] axios:", err?.message || err);
      return null;
    }
  }

  if (!imageBuffer || imageBuffer.length < 1024) return null;

  try {
    const content = await generateWAMessageContent(
      { image: imageBuffer },
      { upload: conn.waUploadToServer }
    );
    if (content?.imageMessage) return content.imageMessage;
  } catch (err) {
    console.warn("[reactions-menu] generateWAMessageContent:", err?.message || err);
  }
  return null;
}

async function sendReactionsMenu(conn, m) {
  const keys = Object.keys(REACTIONS);
  const count = keys.length;

  const bodyText =
    `*⤸⋆🎭 ˹ قــائــمــة الــتــفــاعــلات ⌗*\n` +
    `*${info.decor.line}*\n\n` +
    `*꒰🔢꒱ ⦂ عــدد الــتــفــاعــلات ↜『 ${count} 』*\n` +
    `*꒰💡꒱ ⦂ اضــغــط أي زر لــنــســخ الأمــر 』*\n` +
    `*꒰📝꒱ ⦂ الاســتــخــدام ↜『 .بوسة @شخص 』*\n` +
    `*꒰🎯꒱ ⦂ أو بــالــرد عــلــى رســالــة 』*\n\n` +
    `*${info.decor.line}*`;

  const buttons = keys.map((cmd) => ({
    name: "cta_copy",
    buttonParamsJson: JSON.stringify({
      display_text: `${PREFIX}${cmd}`,
      copy_code: `${PREFIX}${cmd}`,
    }),
  }));

  const headerImage = await prepareHeaderImage(conn);

  const header = headerImage
    ? proto.Message.InteractiveMessage.Header.create({
        title: "",
        subtitle: "",
        hasMediaAttachment: true,
        imageMessage: headerImage,
      })
    : proto.Message.InteractiveMessage.Header.create({
        title: "",
        hasMediaAttachment: false,
      });

  const interactive = proto.Message.InteractiveMessage.create({
    header,
    body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: info.footer || "" }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,
      messageParamsJson: JSON.stringify({
        bottom_sheet: {
          in_thread_buttons_limit: 1,
          list_title: "اختر التفاعل 🎭",
          button_title: "اعرض التفاعلات",
        },
      }),
    }),
  });

  const msgId = generateMessageIDV2(conn.user?.id);
  const wamessage = generateWAMessageFromContent(
    m.chat,
    { interactiveMessage: interactive },
    { userJid: conn.user?.id, messageId: msgId, quoted: m }
  );

  await conn.relayMessage(m.chat, wamessage.message, {
    messageId: wamessage.key.id,
    additionalNodes: [{
      tag: "biz",
      attrs: {},
      content: [{
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
      }],
    }],
  });
}

const handler = async (m, ctx) => {
  const { conn } = ctx;

  if (!claimMessage(`react-menu:${m.chat}:${m.key?.id}`, 15_000)) return;

  await reactSafe(conn, m, "🎭");

  try {
    await sendReactionsMenu(conn, m);
    await reactSafe(conn, m, "✅");
  } catch (err) {
    console.warn("[reactions-menu] send:", err?.message || err);

    try {
      const keys = Object.keys(REACTIONS);
      const chunks = [];
      for (let i = 0; i < keys.length; i += 10) {
        chunks.push(keys.slice(i, i + 10));
      }

      const lines = chunks.map((chunk, ci) => {
        const start = ci * 10 + 1;
        return chunk.map((k, i) => `*${start + i}.* \`${PREFIX}${k}\``).join("\n");
      }).join("\n\n");

      const fallback =
        `*⤸⋆🎭 ˹ قــائــمــة الــتــفــاعــلات ⌗*\n` +
        `*${info.decor.line}*\n\n` +
        `*꒰🔢꒱ ⦂ عــدد الــتــفــاعــلات ↜『 ${keys.length} 』*\n\n` +
        lines + `\n\n` +
        `*${info.decor.line}*\n` +
        `> *${info.footer}*`;

      await conn.sendMessage(m.chat, withForwardBadge({ text: fallback }), { quoted: m });
      await reactSafe(conn, m, "✅");
    } catch {
      await reactSafe(conn, m, "❌");
      return shortErr(conn, m, "فــشــل إرســال الــقــائــمــة");
    }
  }
};

handler.command = ["رياكشن", "رياكشنات", "تفاعلات", "تفاعل", "reactions", "reactlist"];
handler.description = "قــائــمــة تــفــاعــلات GIF مــع أزرار نــســخ 🎭";
handler.category = "Stickers";
handler.group = true;
handler.usage = ["رياكشن", "تفاعلات"];

export default handler;