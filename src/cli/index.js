require('dotenv').config();
// process.env.ZYC_USE_PROXY && require('../utils/proxy').initProxy();

const { Command } = require('commander');
const { Channel } = require('../core/Channel');
const { Newsletter } = require('../core/Newsletter');
const Dayjs = require('../utils/day');

const program = new Command();
const channel = new Channel('CLI');
const newsletter = new Newsletter('CLI');

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
  .option('-d, --day', '[Param] Someday')
  .option('-s, --start-day <StartDay>', '[Param] Start Day')
  .option('-e, --end-day <EndDay>', '[Param] End Day')

  // .option('-t, --today', `Publish today's first post.`)
  // .option('-d, --day [Day]', 'The publishing day of notion post.')
  // .option('--disable-update-status', 'Is auto update post status after published.')
  .parse(process.argv);

/**
 * 解析参数
 */
const run = async () => {
  const options = program.opts();

  // 频道
  if (options.channel) {
    // 发布
    if (options.publish) {
      // 指定 ID
      if (options.pageId) {
        return await channel.sendByPageId(options.pageId);
      }
      // 发送今日
      if (options.today) {
        return await channel.sendByDay(new Date());
      }
      // 发送指定日期
      if (options.day) {
        return await channel.sendByDay(options.day);
      }
    }
  }
  // Newsletter
  else if (options.newsletter) {
    // 生成
    if (options.generate) {
      const startDay = options.startDay || Dayjs().subtract(7, 'day').format('YYYY-MM-DD');
      const endDay = options.endDay || Dayjs().format('YYYY-MM-DD');
      return await newsletter.generateNewsletter(startDay, endDay);
    }
    // 发布
    else if (options.publish) {
      return await newsletter.publishNewsletter(options.pageId);
    }
  }
  // 未指定
  else {
    throw new Error('The context must be specified.');
  }

  // 根据页面 ID 发布，拥有最高优先级
  // if (options.id) {
  //   return channel.sendByPageId(options.pageId, options.disableUpdateStatus);
  // }
  //
  // // 发送当天的第一篇
  // if (options.today) {
  //   return await channel.sendByDay(new Date(), options.disableUpdateStatus);
  // }
  //
  // // 按照日期发送
  // if (options.day) {
  //   return await channel.sendByDay(options.day, options.disableUpdateStatus);
  // }
  //
  // // 生成 Newsletter
  // if (options.newsletter) {
  //   const startDay = options.startDay || Dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  //   const endDay = options.endDay || Dayjs().format('YYYY-MM-DD');
  //   return await newsletter.generateNewsletter(startDay, endDay);
  // }
  //
  // // 发布 Newsletter
  // if (options.pubNewsletter) {
  //   return await newsletter.publishNewsletter(options.id);
  // }
};

run()
  .then((res) => {
    console.log(res);
  })
  .catch((e) => {
    console.error(e);
  });
