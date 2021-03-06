const { NotionClient } = require('./NotionClient');
const { TelegramClient } = require('./TelegramClient');
const Dayjs = require('../utils/day');
const fs = require('fs');
const path = require('path');
const { CHANNEL_DATABASE_ID } = require('../config/constants');
const { HttpClient } = require('./HttpClient');
const { ImageHosting } = require('./ImageHosting');
const { logger } = require('../utils/logger');

class Channel {
  constructor() {
    this.$no = new NotionClient();
    this.$tg = new TelegramClient();
    this.$http = new HttpClient({ timeout: 50000 });
  }

  async sendByPageId(pageId, dryRun) {
    const ctx = await this.$no.getPageCtx(pageId);
    return await this._send(ctx, dryRun);
  }

  async sendByDay(day, dryRun) {
    const pages = await this.$no.queryDatabase({
      database_id: CHANNEL_DATABASE_ID,
      filter: {
        and: [
          {
            property: 'PlanningPublish',
            date: { equals: Dayjs(day).format('YYYY-MM-DD') },
          },
          {
            property: 'Status',
            select: { equals: 'Completed' },
          },
        ],
      },
    });

    // 无可发布内容
    if (!pages.results.length) {
      return { code: '0', message: 'NOTHING_TO_PUBLISH' };
    }

    // 根据 PubPriority 字段对发送列表进行倒叙排序排列，越大的越靠前
    const sortedResults = pages.results.sort(
      (a, b) => b.properties['PubPriority'].number - a.properties['PubPriority'].number
    );

    return await this._send(sortedResults[0], dryRun);
  }

  /**
   * 1. 组装 Notion 内容为 Telegram 可识别内容
   * 2. 发送某个 Notion 页面内容到 Telegram
   * 3. Notion 页面状态更新
   * 4. 本地备份
   */
  async _send(pageCtx, dryRun) {
    logger.info(`Sending Post: ${pageCtx.id}`);

    // ============================================
    // 获取封面
    // ============================================
    const COVERS = this._buildCovers(pageCtx);
    if (COVERS.length > 10) {
      throw new Error('Too Many Covers.');
    }

    // ============================================
    // 组装正文
    // ============================================
    let TEXT = '';

    // 添加标签
    const _tags = this._buildTags(pageCtx);
    TEXT += `${_tags}`;

    // 添加标题
    if (!NotionClient.getProperty(pageCtx, 'IsHideTitle')) {
      const _title = this._buildTitle(pageCtx);
      TEXT += `\n\n${_title}`;
    }

    // 添加内容。内容仅支持：1. 顶级内容无嵌套；2. 只支持标准 Markdown 格式
    const pageBlocks = await this.$no.getFullBlocksList(pageCtx.id);
    const _content = this._buildContent(pageBlocks.results);
    TEXT += `\n\n${_content}`;

    // 添加频道名
    if (!NotionClient.getProperty(pageCtx, 'IsHideCopyright')) {
      TEXT += `\n\n频道：@AboutZY`;
    }

    logger.info(`Ready send to Telegram: COVERS: ${COVERS}`);
    logger.info(`Ready send to Telegram: TEXT: ${TEXT}`);
    logger.info(`Ready send to Telegram: TEXT LENGTH: ${TEXT.length}`);

    // ============================================
    // 发送至 Telegram
    // ============================================
    if (!dryRun) {
      // 无图片
      if (!COVERS.length) {
        await this.$tg.sendMessage({ text: TEXT });
      }
      // 1 张图片
      else if (COVERS.length === 1) {
        await this.$tg.sendPhoto({ caption: TEXT, photo: COVERS[0] });
      }
      // 多图
      else {
        await this.$tg.sendMediaGroup({ caption: TEXT, medias: COVERS });
      }
    }

    // ============================================
    // Notion 页面状态、发布时间更新
    // ============================================
    if (!dryRun) {
      await this.$no.updateProperty(pageCtx.id, {
        Status: { select: { name: 'UnNewsletter' } },
        RealPubTime: {
          date: { start: Dayjs().format('YYYY-MM-DD HH:mm:ss'), time_zone: Dayjs.tz.guess() },
        },
      });
    }

    // ============================================
    // 本地存档备份
    // ============================================
    // 创建基础备份文件夹
    const backupDir = process.env.CHANNEL_BACKUP_DIR || path.resolve(__dirname, '../../backup');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

    // 当前 post 文件夹
    const currentPostSpace = path.resolve(
      backupDir,
      `${Dayjs().format('YYYY-MM-DD_HH-mm-ss')}_${pageCtx.id}`
    );
    if (!fs.existsSync(currentPostSpace)) fs.mkdirSync(currentPostSpace);

    // 备份文字
    fs.writeFileSync(path.join(currentPostSpace, '_text.txt'), TEXT);

    logger.info(`Post Text Backup Success`);

    // 备份图片
    if (NotionClient.getProperty(pageCtx, 'Cover')[0]) {
      for (const cover of NotionClient.getProperty(pageCtx, 'Cover')) {
        const index = NotionClient.getProperty(pageCtx, 'Cover').indexOf(cover);

        try {
          const imageHosting = new ImageHosting();
          await imageHosting.download(cover.file.url, currentPostSpace, `cover_${index}`);
          logger.info(`Cover Backup Success: cover_${index}`);
        } catch (e) {
          logger.error(`Cover Backup Error: ${e.message}`);
        }
      }
    }

    // ============================================
    // 发送完成
    // ============================================
    return { code: 0, message: 'SENT' };
  }

  /**
   * 对文本进行转义，保证符号能够正确输出
   * <https://core.telegram.org/bots/api#markdownv2-style>
   */
  _escapeText(str) {
    return str.replace(/[_*[\]()>~`#+\-=|{}.!\\]/g, '\\$&');
  }

  /**
   * 构建一个链接
   */
  _buildLink(text, url) {
    return `[${text}](${this._escapeText(url)})`;
  }

  /**
   * 构建封面
   */
  _buildCovers(pageCtx) {
    return NotionClient.getProperty(pageCtx, 'Cover').map((cover) => cover.file.url);
  }

  /**
   * 构建标签。分类总是第一个标签
   */
  _buildTags(pageCtx) {
    const category = NotionClient.getProperty(pageCtx, 'Category').name;
    const tags = NotionClient.getProperty(pageCtx, 'Tags').map((tag) => tag.name);

    return [category, ...tags].map((tag) => `\\#${tag}`).join(' ');
  }

  /**
   * 自动组装 Title， TitleLink 和 Emoji，并添加加粗效果
   */
  _buildTitle(pageCtx) {
    const plainTextTitle = pageCtx.properties.Name.title.map((title) => title.plain_text).join('');
    const escapedTitle = this._escapeText(plainTextTitle);
    const boldedTitle = `*${escapedTitle}*`;
    const linkedTitle = pageCtx.properties.TitleLink.url
      ? this._buildLink(boldedTitle, pageCtx.properties.TitleLink.url)
      : boldedTitle;
    const emoji = pageCtx.icon?.emoji;

    return emoji ? emoji + ' ' + linkedTitle : linkedTitle;
  }

  /**
   * 构建内容
   */
  _buildContent(pageBlocks) {
    let numberedOrder = 0;

    return pageBlocks
      .map((block) => {
        // ============================================
        // 对支持的 block 内容进行转译
        // ============================================
        const blockTypeRelation = {
          paragraph: this._translateParagraph,
          quote: this._translateQuote,
          numbered_list_item: this._translateNumberedList,
          bulleted_list_item: this._translateBulletedList,
          code: this._translateCode,
        };

        if (!blockTypeRelation[block.type]) {
          throw new Error(`Unsupported Block Type: ${block.type}`);
        }

        const method = blockTypeRelation[block.type];
        if (block.type === 'numbered_list_item') {
          numberedOrder++;
          return method.call(this, block[block.type], numberedOrder);
        } else {
          numberedOrder = 0;
          return method.call(this, block[block.type]);
        }
      })
      .join('\n')
      .trim();
  }

  _translateRichTextSnippet(snippet) {
    let finalText = this._escapeText(snippet.plain_text);

    // 对文字进行基本转义。需要注意转义顺序
    if (snippet.annotations.code) finalText = `\`${finalText}\``;
    if (snippet.annotations.strikethrough) finalText = `~${finalText}~`;
    if (snippet.annotations.italic) finalText = `_${finalText}_`;
    if (snippet.annotations.underline) finalText = `__${finalText}__`;
    if (snippet.annotations.bold) finalText = `*${finalText}*`;
    finalText = finalText.replaceAll(`\\|\\|`, '||');
    // 如果包含链接
    if (snippet.href) finalText = this._buildLink(finalText, snippet.href);

    return finalText;
  }

  /**
   * 转义 Notion 中的文本段落
   */
  _translateParagraph({ rich_text }) {
    return rich_text.map(this._translateRichTextSnippet.bind(this)).join('');
  }

  /**
   * 转义 Notion 中的 Quote，自动添加斜体
   */
  _translateQuote({ rich_text }) {
    return rich_text
      .map((snippet) => {
        snippet.annotations.italic = true;
        return snippet;
      })
      .map(this._translateRichTextSnippet.bind(this))
      .join();
  }

  /**
   * 转义 Notion 的有序列表，自动加 1234
   */
  _translateNumberedList({ rich_text }, currentOrder) {
    return rich_text
      .map(this._translateRichTextSnippet.bind(this))
      .map((text) => this._escapeText(`${currentOrder}.`) + ' ' + text)
      .join('');
  }

  /**
   * 转义 Notion 的无序列表
   */
  _translateBulletedList({ rich_text }) {
    const line = rich_text.map(this._translateRichTextSnippet.bind(this)).join('');
    return this._escapeText(`* `) + line;
  }

  /**
   * 转义 Notion 的代码块
   */
  _translateCode({ rich_text, language }) {
    const startLine = this._escapeText('```' + language);
    const codeBlock = `\`\`\`${language}\n${rich_text[0].plain_text}\n\`\`\``;
    const endLine = this._escapeText('```');
    return `${startLine}\n${codeBlock}\n${endLine}`;
  }
}

module.exports = { Channel };
