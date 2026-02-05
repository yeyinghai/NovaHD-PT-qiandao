

# NovaHD PT 签到

一个专为NovaHD PT 站点设计的自动化签到脚本，部署于青龙面板，具备趣味防护机制和多种推送方式。


## 📦 部署流程

### 1. 环境准备
确保已安装以下依赖：
```bash
npm install axios https-proxy-agent
```

### 2. 创建脚本
1. 登录青龙面板
2. 进入「脚本管理」→「新建脚本」
3. 将 `qiandao-bark.js` 内容粘贴到脚本编辑器
4. 保存脚本（建议命名为 `pt_sign.js`）

### 3. 配置环境变量
在「环境变量」中添加以下配置（详见下方环境变量说明）

### 4. 运行脚本
1. 新建定时任务名称随意， 命令 task pt_sign.js 
2. 定时规则 0 0 8 * * * （每天 08:00 执行）

## ⚙️ 环境变量设置

| 变量名 | 必填 | 说明 | 示例 |
|--------|------|------|------|
| `PT_WEBHOOK_URL` | ✅ | 推送地址 | `https://api.day.app/yourkey/` |
| `PT_SITE_<大写站点>_CK` | ✅ | 站点 Cookie | `PT_SITE_HDKYL_CK=xxx` |

### 推送配置示例
```bash
# 飞书机器人
PT_WEBHOOK_TYPE=feishu
PT_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx

# Bark 推送
PT_WEBHOOK_TYPE=bark
PT_WEBHOOK_URL=https://api.day.app/yourkey/

# Server酱
PT_WEBHOOK_TYPE=sct
PT_WEBHOOK_URL=https://sctapi.ftqq.com/SCTxxx.send
```

## 🌐 站点管理

### 添加新站点
1. **修改脚本中的 `sites` 对象**：
   ```javascript
   const sites = {
     // 已有站点...站点的缩写和上面`PT_SITE_<大写站点>_CK里面的大写站点 保持一致
     newpt: {
       host: 'newpt.com',
       url: 'https://newpt.com/attendance.php'
     }
   };
   ```
2. **添加对应环境变量**：
   ```bash
   PT_SITE_NEWPT_CK=your_cookie_here
   ```

### 删除站点
1. 从 `sites` 对象中移除站点配置
2. 删除对应的环境变量

### Cookie 获取方法
1. 浏览器登录目标站点
2. 按 F12 打开开发者工具
3. 刷新页面 → Network → 找到主页请求
4. 复制请求头中的 `Cookie` 字段值

## 📋 运行日志示例
```
==================== NovaHD 签到详情解析结束 ====================
[小可爱签到机] 🎉 签到成功！今天已经打过卡啦~
[小可爱签到机] 📊 解析结果 - 连续签到：未获取天，奖励：10魔力值
[小可爱签到机] 
===== 签到汇总 =====
novahd: ✅ 签到成功
  🎁 获得奖励：10魔力值
[小可爱签到机] 推送小纸条成功啦！返回码：200，内容：{"code":200,"message":"success","timestamp":1770272491}
[小可爱签到机] 全部任务完成，准备打个盹，明天见！
```
## bark收到的信息示例

![af5a96b47c83cbd8ef1792446657e7cb](https://github.com/user-attachments/assets/566c1174-15f1-41c5-a2bc-2e4553c6cd03)


## ⚠️ 注意事项

1. **Cookie 安全**：
   - Cookie 包含敏感信息，请勿泄露
   - 定期更新 Cookie（建议每月更新一次）

## 🐛 常见问题

| 问题 | 解决方案 |
|------|----------|
| 签到失败：Cookie 未配置 | 检查环境变量名是否正确（大写站点名） |
| 签到失败：Cookie 失效 | 重新获取站点 Cookie |

# 本项目从 Flyingpen/PT-sign 这个项目改编而来。

## 原项目地址：[Flyingpen/PT-sign](https://github.com/Flyingpen/PT-sign)
