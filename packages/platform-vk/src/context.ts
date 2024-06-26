import type { IMessageContextSendOptions, MessageContext } from 'vk-io';
import type { ISendMessageOptions } from '@henta/core';
import { normalizeUploads, PlatformContext } from '@henta/core';
import getKeyboardButton from './util/keyboard.js';
import VkAttachment from './attachment.js';
import { uploadFile } from './util/files.js';

export default class PlatformVkContext extends PlatformContext {
  public readonly source = 'vk';
  public declare raw: MessageContext;

  public constructor(raw: MessageContext, platform: any) {
    super(raw, null, platform);
    this.text = this.raw.text;
    this.payload = this.raw.messagePayload;
  }

  public get originalText() {
    return this.raw.text;
  }

  public get senderId() {
    return this.raw.senderId.toString();
  }

  public get peerId(): string {
    return this.raw.peerId.toString();
  }

  public get messageId(): string {
    return this.raw.conversationMessageId.toString();
  }

  public get isChat() {
    return this.raw.isChat;
  }

  public get attachments() {
    return this.raw.attachments.map(
      (attachment) =>
        new VkAttachment(attachment.type, attachment.toJSON(), this.platform),
    );
  }

  public get nestedAttachments() {
    const response = [];

    if (this.raw.hasReplyMessage) {
      response.push(...this.raw.replyMessage.attachments);
    }

    if (this.raw.hasForwards) {
      this.raw.forwards.forEach((v) => response.push(...v.attachments));
    }

    return response.map(
      (attachment) =>
        new VkAttachment(attachment.type, attachment.toJSON(), this.platform),
    );
  }

  public serialize() {
    return this.raw['payload'];
  }

  public async send(message: ISendMessageOptions, isAnswer = false) {
    let attachment = [];
    if (message.files?.length) {
      const files = await normalizeUploads(message.files);
      attachment = await Promise.all(
        files.map((file) => uploadFile(this, file)),
      );
    }

    const forwardOptions = this.raw.conversationMessageId
      ? { conversation_message_ids: this.raw.conversationMessageId }
      : { message_ids: this.raw.id };

    const messageBody = {
      ...(this.isChat && isAnswer
        ? {
            forward: JSON.stringify({
              ...forwardOptions,

              peer_id: this.peerId,
              is_reply: true,
            }),
          }
        : {}),
      message: message.text,
      content_source: JSON.stringify({
        type: 'message',
        owner_id: this.raw.senderId,
        peer_id: this.raw.peerId,
        conversation_message_id: this.raw.conversationMessageId,
      }),
      attachment,
      dont_parse_links: !(message.isParseLinks ?? true),
      keyboard:
        message.keyboard &&
        JSON.stringify({
          inline: true,
          buttons: this.normalizeKeyboard(message.keyboard, 4, 5, 10).map(
            (row) => row.map((v) => getKeyboardButton(v)),
          ),
        }),
    } as IMessageContextSendOptions;

    if (this.sendedAnswer && isAnswer) {
      await this.sendedAnswer.editMessage(messageBody);
      return this.sendedAnswer;
    }

    return this.raw.send(messageBody);
  }
}
