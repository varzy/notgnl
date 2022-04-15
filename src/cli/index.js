require('dotenv').config();

const { Command } = require('commander');
const { Channel } = require('../core/Channel');
const { Newsletter } = require('../core/Newsletter');
const Dayjs = require('../utils/day');
const { logger } = require('../utils/logger');

const program = new Command();
const channel = new Channel();
const newsletter = new Newsletter();

/**
 * 设计命令行
 */
program
  .option('-c --channel', `[Context] Channel`)
  .option('-n, --newsletter', `[Context] Newsletter`)
  .option('-p --publish', `[Action] Publish`)
  .option('-g --generate', `[Action] Generate a new Newsletter`)
  .option('-i, --page-id <PageId>', `[Param] Use PageId`)
  .option('-t, --today', '[Param] Today')
  .option('-d, --day <Day>', '[Param] Someday')
  .option('-s, --start-day <StartDay>', '[Param] Start Day')
  .option('-e, --end-day <EndDay>', '[Param] End Day')
  .option('--dry-run', `[Param] Do not anything`)
  .parse(process.argv);

/**
 * 解析参数
 */
const run = async () => {
  const options = program.opts();

  logger.info(`CLI Options: ${JSON.stringify(options)}`);

  // 频道
  if (options.channel) {
    // 发布
    if (options.publish) {
      // 指定 ID
      if (options.pageId) {
        logger.info(`Channel: Publish: PageId: ${options.pageId}`);
        return await channel.sendByPageId(options.pageId, options.dryRun);
      }
      // 发送今日
      if (options.today) {
        logger.info(`Channel: Publish: Today`);
        return await channel.sendByDay(new Date(), options.dryRun);
      }
      // 发送指定日期
      if (options.day) {
        logger.info(`Channel: Publish: Day: ${options.day}`);
        return await channel.sendByDay(options.day, options.dryRun);
      }
    }
  }
  // Newsletter
  else if (options.newsletter) {
    // 生成
    if (options.generate) {
      const startDay = options.startDay || Dayjs().subtract(7, 'day').format('YYYY-MM-DD');
      const endDay = options.endDay || Dayjs().format('YYYY-MM-DD');

      logger.info(`Newsletter: Generate: From [${startDay}] to [${endDay}]`);
      return await newsletter.generateNewsletter(startDay, endDay);
    }
    // 发布
    else if (options.publish) {
      logger.info(`Newsletter: Publish: ${options.pageId}`);
      return await newsletter.publishNewsletter(options.pageId, options.dryRun);
    }
  }
  // 未指定
  else {
    throw new Error('The context must be specified.');
  }
};

run()
  .then((res) => {
    logger.info(`CLI DONE!: ${JSON.stringify(res)}`);
  })
  .catch((e) => {
    logger.error(`CLI ERROR!: ${e.message}`);
  });
