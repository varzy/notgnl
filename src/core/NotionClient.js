const { Client } = require('@notionhq/client');
const { NOTION_AUTH_KEY } = require('../config/constants');
const HttpsProxyAgent = require('https-proxy-agent');

class NotionClient {
  static getProperty(pageCtx, propertyName) {
    const type = pageCtx.properties[propertyName].type;
    return pageCtx.properties[propertyName][type];
  }

  static buildBlock(type, ctx, otherRootProps) {
    return {
      type,
      [type]: ctx,
      ...otherRootProps,
    };
  }

  constructor() {
    const options = { auth: NOTION_AUTH_KEY };
    if (process.env.ZYC_USE_PROXY) {
      options.agent = new HttpsProxyAgent(process.env.ZYC_PROXY_ADDRESS);
    }
    this.notion = new Client(options);
  }

  self() {
    return this.notion;
  }

  // ================================================
  // Databases
  // ================================================

  async queryDatabase(query) {
    return this.notion.databases.query(query);
  }

  // ================================================
  // Pages
  // ================================================

  async getPageCtx(pageId) {
    return this.notion.pages.retrieve({ page_id: pageId });
  }

  async updateProperty(pageId, properties) {
    return this.notion.pages.update({ page_id: pageId, properties });
  }

  async createPage(query) {
    return this.notion.pages.create(query);
  }

  // ================================================
  // Blocks
  // ================================================

  async getBlock(blockId) {
    return this.notion.blocks.retrieve({ block_id: blockId });
  }

  async getBlocks(query) {
    return this.notion.blocks.children.list(query);
  }

  async appendChildren(blockId, children) {
    return this.notion.blocks.children.append({ block_id: blockId, children });
  }

  /**
   * 获取全部 Blocks
   */
  async getFullBlocksList(blockId) {
    let allBlocks = [];
    let blocksCtx = null;
    let startCursor = undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const resBlocks = await this.getBlocks({
        block_id: blockId,
        page_size: 100,
        start_cursor: startCursor,
      });
      allBlocks = [...allBlocks, ...resBlocks.results];

      if (resBlocks.has_more) {
        startCursor = resBlocks.next_cursor;
      } else {
        blocksCtx = resBlocks;
        resBlocks.results = allBlocks;
        break;
      }
    }

    return blocksCtx;
  }
}

module.exports = { NotionClient };
