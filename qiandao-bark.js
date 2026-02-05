/**
 * PT 签到 Bark推送
 * 专门 NovaHD 信息解析和 Bark 推送
 */

const axios = require('axios');
const HttpsProxyAgent = require('https-proxy-agent');

const RETRY = Number(process.env.PT_RETRY) || 3;
const PROXY = process.env.PT_PROXY || null;
const WEBHOOK_URL = process.env.PT_WEBHOOK_URL;
const WEBHOOK_TYPE = (process.env.PT_WEBHOOK_TYPE || 'bark').toLowerCase();
const WAF_BYPASS = !!process.env.PT_WAF_BYPASS;
const EXTRA_HEADERS = process.env.PT_EXTRA_HEADERS || '';
const DEBUG = !!process.env.PT_DEBUG;

if (!WEBHOOK_URL) throw new Error('❌ 未配置 PT_WEBHOOK_URL，快去补上推送地址吧！');

const httpConfig = {
  timeout: 15000,
};
if (PROXY) {
  httpConfig.httpsAgent = new HttpsProxyAgent.HttpsProxyAgent(PROXY);
}
const http = axios.create(httpConfig);

// 趣味化日志输出
function log(msg) {
  console.log(`[小可爱签到机] ${msg}`);
}
function error(msg) {
  console.error(`[小可爱签到机] ${msg}`);
}
function debug(msg) {
  console.log(`[🔍调试] ${msg}`);
}

// 随机 UA 列表
const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
];

function randomIP() {
  return Array(4).fill(0).map(() => Math.floor(Math.random() * 254) + 1).join('.');
}

function getExtraHeaders() {
  const headers = {};
  if (EXTRA_HEADERS) {
    EXTRA_HEADERS.split('|').forEach(pair => {
      const [k, v] = pair.split(':');
      if (k && v) headers[k.trim()] = v.trim();
    });
  }
  return headers;
}

function randomHeaders(siteKey) {
  const headers = {
    'user-agent': UA_LIST[Math.floor(Math.random() * UA_LIST.length)],
    'referer': `https://${sites[siteKey].host}/`,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'accept-encoding': 'gzip, deflate, br',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'x-forwarded-for': randomIP(),
    'x-real-ip': randomIP(),
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-dest': 'document',
    'upgrade-insecure-requests': '1',
    ...getExtraHeaders()
  };
  return headers;
}

// 增强的 NovaHD 签到信息解析
function parseNovaHDAttendance(html) {
  debug('==================== 开始解析 NovaHD 签到详情 ====================');

  let continuousDays = null;
  let reward = null;
  let totalSignCount = null;

  // 移除HTML标签，获取纯文本用于分析
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  if (DEBUG) {
    debug('========== 页面纯文本内容（前1000字符）==========');
    debug(plainText.slice(0, 1000));
    debug('===============================================');
  }

  // 1. 检测签到成功状态的多种模式
  const successPatterns = [
    /签到成功/i,
    /签到完成/i,
    /attendance.*success/i,
    /恭喜.*签到/i,
    /今日签到获得/i,
    /本次签到获得/i,
    /签到奖励/i,
    /魔力值.*增加/i,
    /连续签到.*天/i,
  ];

  const hasSignSuccess = successPatterns.some(pattern => pattern.test(html));
  debug(`签到成功状态检测: ${hasSignSuccess}`);

  // 2. 提取连续签到天数 - 多种模式
  const continuousPatterns = [
    // 标准格式
    /已连续签到\s*<b>(\d+)<\/b>\s*天/i,
    /连续签到\s*<b>(\d+)<\/b>\s*天/i,
    /连续签到[：:\s]*(\d+)\s*天/i,
    /已连续签到[：:\s]*(\d+)\s*天/i,
    /连续\s*(\d+)\s*天签到/i,
    /(\d+)\s*天连续签到/i,
    // 表格格式
    /<td[^>]*>连续签到天数<\/td>\s*<td[^>]*>(\d+)/i,
    /<td[^>]*>连续[：:]*<\/td>\s*<td[^>]*>(\d+)/i,
    // 纯文本格式
    /连续签到\s*(\d+)\s*天/i,
    /已连续\s*(\d+)\s*天/i,
    // 更宽松的匹配
    /连续.*?(\d+).*?天/i,
  ];

  for (const pattern of continuousPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && parseInt(match[1]) > 0) {
      continuousDays = match[1];
      debug(`✅ 匹配到连续签到天数: ${continuousDays}天 (模式: ${pattern})`);
      break;
    }
  }

  // 3. 提取奖励信息 - 多种模式
  const rewardPatterns = [
    // 标准格式
    /本次签到获得\s*<b>(\d+)<\/b>\s*个魔力值/i,
    /今日签到获得\s*<b>(\d+)<\/b>\s*个魔力值/i,
    /签到奖励[：:\s]*<b>(\d+)<\/b>\s*魔力值/i,
    /获得[：:\s]*<b>(\d+)<\/b>\s*魔力值/i,
    // 表格格式
    /<td[^>]*>今日奖励<\/td>\s*<td[^>]*>(\d+)\s*魔力值/i,
    /<td[^>]*>奖励[：:]*<\/td>\s*<td[^>]*>(\d+)/i,
    // 纯文本格式
    /本次签到获得\s*(\d+)\s*个魔力值/i,
    /今日签到获得\s*(\d+)\s*个魔力值/i,
    /签到奖励[：:\s]*(\d+)\s*魔力值/i,
    /获得[：:\s]*(\d+)\s*魔力值/i,
    /奖励[：:\s]*(\d+)\s*魔力值/i,
    // 更宽松的匹配
    /[+增加得到获得]\s*(\d+)\s*魔力值/i,
    /魔力值[+增加得到获得]\s*(\d+)/i,
    /(\d+)\s*个魔力值/i,
  ];

  for (const pattern of rewardPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && parseInt(match[1]) > 0) {
      reward = `${match[1]}魔力值`;
      debug(`✅ 匹配到奖励信息: ${reward} (模式: ${pattern})`);
      break;
    }
  }

  // 4. 提取总签到次数
  const totalPatterns = [
    /这是您的第\s*<b>(\d+)<\/b>\s*次签到/i,
    /第\s*<b>(\d+)<\/b>\s*次签到/i,
    /签到次数[：:\s]*<b>(\d+)<\/b>/i,
    /总计签到[：:\s]*(\d+)\s*次/i,
    /这是您的第\s*(\d+)\s*次签到/i,
    /第\s*(\d+)\s*次签到/i,
    /签到次数[：:\s]*(\d+)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = html.match(pattern);
    if (match && match[1] && parseInt(match[1]) > 0) {
      totalSignCount = match[1];
      debug(`✅ 匹配到总签到次数: 第${totalSignCount}次 (模式: ${pattern})`);
      break;
    }
  }

  // 5. 如果没有找到信息，尝试从页面中搜索数字
  if (!continuousDays || !reward) {
    debug('尝试从页面中搜索可能的数字信息...');

    // 搜索所有数字，看是否有签到相关的
    const numbers = plainText.match(/\d+/g) || [];
    debug(`页面中找到的数字: ${numbers.slice(0, 10).join(', ')}${numbers.length > 10 ? '...' : ''}`);

    // 如果页面包含"签到"相关文字，尝试提取附近的数字
    if (/签到|魔力值|连续|奖励/i.test(plainText)) {
      debug('页面包含签到相关内容，但解析失败');

      // 输出签到相关的文本片段
      const signRelatedText = plainText.match(/.{0,50}[签到魔力值连续奖励].{0,50}/gi) || [];
      signRelatedText.forEach((text, index) => {
        debug(`签到相关片段${index + 1}: ${text}`);
      });
    }
  }

  if (!continuousDays) debug('⚠️ 未匹配到连续签到天数');
  if (!reward) debug('⚠️ 未匹配到奖励信息');
  if (!totalSignCount) debug('⚠️ 未匹配到总签到次数');

  debug('==================== NovaHD 签到详情解析结束 ====================');

  return {
    continuousDays,
    reward,
    totalSignCount,
    hasSignSuccess
  };
}

const sites = {
  novahd: {
    host: 'pt.novahd.top',
    url: 'https://pt.novahd.top/attendance.php',
    parseReward: (html) => parseNovaHDAttendance(html)
  }
};

// 修复的推送函数 - 专门优化 Bark
async function push(title, content) {
  // 确保内容不为空
  if (!content || content.trim() === '') {
    content = '签到完成，但未获取到详细信息';
  }

  let payload;
  switch (WEBHOOK_TYPE) {
    case 'bark':
      // Bark 专用格式优化
      payload = {
        title: title || 'PT签到结果',
        body: content,
        sound: 'default',
        group: 'PT签到'
      };
      break;
    case 'feishu':
      payload = { msg_type: 'text', content: { text: `${title}\n${content}` } };
      break;
    case 'sct':
      payload = { title, desp: content };
      break;
    case 'ding':
      payload = { msgtype: 'text', text: { content: `${title}\n${content}` } };
      break;
    case 'wx':
      payload = { msgtype: 'text', text: { content: `${title}\n${content}` } };
      break;
    default:
      payload = { title, content };
  }

  try {
    const { status, data } = await http.post(WEBHOOK_URL, payload, { timeout: 5000 });
    log(`推送小纸条成功啦！返回码：${status}，内容：${JSON.stringify(data)}`);
  } catch (e) {
    error(`推送小纸条翻车了！错误码：${e.response?.status}，原因：${e.response?.data || e.message}`);
  }
}

// 签到逻辑
async function sign(siteKey) {
  const site = sites[siteKey];
  const rawCookie = process.env[`PT_SITE_${siteKey.toUpperCase()}_CK`]?.trim();

  if (!rawCookie) {
    const msg = `${siteKey}: ❌ Cookie 没找到，快去面板里补上吧！`;
    error(msg);
    await push('PT 签到失败', msg + '【原因：缺少站点 Cookie，无法模拟你出现在网站上】');
    return { site: siteKey, ok: false, reason: 'Cookie 未配置' };
  }

  // Cookie 清理
  const cookie = rawCookie.replace(/[\r\n\t]/g, '');
  let headers = { cookie, ...randomHeaders(siteKey) };
  log(`${siteKey}：准备开始签到咯！`);

  for (let i = 1; i <= RETRY; i++) {
    if (WAF_BYPASS) {
      let delay = Math.floor(5000 + Math.random() * 30000);
      log(`正在悄悄等待 ${delay / 1000} 秒，避开雷池小雷达...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const { status, headers: respHeaders, data: html } = await http.get(site.url, { headers });

      if (DEBUG) {
        debug('========================================');
        debug(`站点: ${siteKey}`);
        debug('完整 HTML 长度: ' + html.length + ' 字符');
        debug('前 2000 字符:');
        debug(html.slice(0, 2000));
        debug('========================================');
      }

      // 检查是否被重定向到登录页
      if (status === 302 || status === 301) {
        const loc = respHeaders.location || '';
        if (/login\.php|takelogin\.php/i.test(loc)) {
          throw new Error('Cookie 失效，被重定向到登录页');
        }
      }

      // 检查是否包含登录失败信息
      if (/需要启用cookies才能登录|连续登录失败/i.test(html)) {
        throw new Error('Cookie 失效，页面显示需要重新登录');
      }

      // 解析页面信息
      const rewardInfo = site.parseReward ? site.parseReward(html) : {};
      const { continuousDays, reward, totalSignCount, hasSignSuccess } = rewardInfo;

      // 检查是否已经签到
      const alreadySignedPatterns = [
        /今日已签到/i,
        /签到已得/i,
        /already signed/i,
        /今天已经签到/i,
        /您今日已签到/i,
        /今日签到完成/i,
        /attendance.*complete/i,
        /今日已打卡/i,
        /已经签到/i,
        /签到完成/i,
      ];

      const isAlreadySigned = alreadySignedPatterns.some(pattern => pattern.test(html));

      if (isAlreadySigned || hasSignSuccess) {
        log(`今天已经打过卡啦，摸摸头~`);

        // 构建详细的签到信息
        let detailMsg = '✅ 今日已签到';
        if (totalSignCount) {
          detailMsg += `\n📊 这是您的第 ${totalSignCount} 次签到`;
        }
        if (continuousDays) {
          detailMsg += `\n🎯 已连续签到 ${continuousDays} 天`;
        }
        if (reward) {
          detailMsg += `\n🎁 本次签到获得 ${reward}`;
        }

        if (!continuousDays && !reward && !totalSignCount) {
          detailMsg += '\n⚠️ 未能获取详细签到信息';
          log(`⚠️ 警告：未能解析到签到信息，请开启调试模式 (PT_DEBUG=1) 查看详情`);
        }

        log(`📊 解析结果 - 总次数：${totalSignCount || '未获取'}，连续：${continuousDays || '未获取'}天，奖励：${reward || '未获取'}`);

        return {
          site: siteKey,
          ok: true,
          reason: '今日已签到',
          continuousDays,
          reward,
          totalSignCount,
          detailMsg
        };
      }

      // 尝试签到
      debug('页面未显示已签到，尝试执行签到操作...');

      const postData = 'action=attendance';
      const postHeaders = {
        ...headers,
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': postData.length.toString()
      };

      const { status: st2, data: d2 } = await http.post(site.url, postData, { headers: postHeaders });

      if (DEBUG) {
        debug('POST 响应长度: ' + d2.length + ' 字符');
        debug('前 2000 字符:');
        debug(d2.slice(0, 2000));
      }

      // 解析 POST 响应
      const postRewardInfo = site.parseReward ? site.parseReward(d2) : {};
      const postSuccess = postRewardInfo.hasSignSuccess;

      if (postSuccess || st2 === 302) {
        log('签到 POST 请求成功！');

        // 等待一秒后重新获取页面信息
        await new Promise(r => setTimeout(r, 1000));
        const { data: refreshHtml } = await http.get(site.url, { headers });
        const finalInfo = site.parseReward ? site.parseReward(refreshHtml) : {};

        const finalContinuousDays = finalInfo.continuousDays || postRewardInfo.continuousDays;
        const finalReward = finalInfo.reward || postRewardInfo.reward;
        const finalTotalCount = finalInfo.totalSignCount || postRewardInfo.totalSignCount;

        // 构建详细的签到成功信息
        let successMsg = '🎉 签到成功！';
        if (finalTotalCount) {
          successMsg += `\n📊 这是您的第 ${finalTotalCount} 次签到`;
        }
        if (finalContinuousDays) {
          successMsg += `\n🎯 已连续签到 ${finalContinuousDays} 天`;
        }
        if (finalReward) {
          successMsg += `\n🎁 本次签到获得 ${finalReward}`;
        }

        log(`恭喜你，签到成功！总次数：${finalTotalCount || '未获取'}，连续：${finalContinuousDays || '未获取'}天，获得奖励：${finalReward || '未获取'}！撒花~`);

        return {
          site: siteKey,
          ok: true,
          reason: '签到成功',
          continuousDays: finalContinuousDays,
          reward: finalReward,
          totalSignCount: finalTotalCount,
          detailMsg: successMsg
        };
      }

      throw new Error(`签到失败：POST响应未显示成功状态`);

    } catch (err) {
      error(`[${siteKey}] 第 ${i} 次尝试翻车了：${err.message}`);
      if (i === RETRY) {
        const msg = `${siteKey}: ❌ ${err.message}`;
        await push('PT 签到失败', msg);
        return { site: siteKey, ok: false, reason: err.message };
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

function getZhReason(msg) {
  if (/Cookie 失效/.test(msg)) return '你的 Cookie 过期啦，需要重新获取';
  if (/formhash/.test(msg)) return '网站页面结构变了，脚本需要升级';
  if (/接口返回异常/.test(msg)) return '服务器返回内容不对，可能网站升级或维护中';
  if (/Cookie 未配置/.test(msg)) return '没有填写站点 Cookie';
  if (/今日已签到/.test(msg)) return '今日已签到，无需重复打卡';
  if (/签到成功/.test(msg)) return '';
  return '未知原因，请查看日志详细信息';
}

// 主流程
(async () => {
  log('可爱的小机器人上线啦，开始为你自动签到！');
  if (DEBUG) log('🔍 调试模式已启用，将输出详细信息');
  if (PROXY) {
    log(`检测到代理设置，已启用代理: ${PROXY}`);
  } else {
    log('当前未使用代理，直接访问站点。');
  }

  const results = [];
  for (const key of Object.keys(sites)) results.push(await sign(key));

  // 生成包含详细奖励信息的汇总报告
  const summary = results.map(r => {
    if (r.ok) {
      // 使用详细信息或构建基本信息
      if (r.detailMsg) {
        return `${r.site}: ${r.detailMsg}`;
      } else {
        let msg = `${r.site}: ✅ ${r.reason}`;
        if (r.totalSignCount) {
          msg += `\n  📊 第 ${r.totalSignCount} 次签到`;
        }
        if (r.continuousDays) {
          msg += `\n  🎯 连续签到：${r.continuousDays}天`;
        }
        if (r.reward) {
          msg += `\n  🎁 获得奖励：${r.reward}`;
        }
        return msg;
      }
    } else {
      return `${r.site}: ❌ 签到失败（原因：${getZhReason(r.reason)}）`;
    }
  }).join('\n\n');

  log('\n===== 签到汇总 =====\n' + summary);
  await push('PT 签到结果', summary);
  log('全部任务完成，准备打个盹，明天见！');
})();
