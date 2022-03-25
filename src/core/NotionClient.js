const { Client } = require('@notionhq/client');
const { NOTION_AUTH_KEY } = require('../config/constants');

class NotionClient {
  static getProperty(pageCtx, propertyName) {
    const type = pageCtx.properties[propertyName].type;
    return pageCtx.properties[propertyName][type];
  }

  constructor() {
    this.notion = new Client({ auth: NOTION_AUTH_KEY });
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

  async latestPage(databaseId, isByCreated = true) {
    const res = await this.notion.databases.query({
      database_id: databaseId,
      sorts: [
        {
          timestamp: isByCreated ? 'created_time' : 'last_edited_time',
          direction: 'descending',
        },
      ],
    });

    return res.results[0];
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

  async appendChildren(query) {
    return this.notion.blocks.children.append(query);
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
