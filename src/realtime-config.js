// 腾讯云 CloudBase 网页端配置。
// 创建环境并开启匿名登录后，填写环境 ID 与可发布密钥即可启用三端实时联动。
window.__QINGDAOFU_REALTIME__ = {
  provider: 'cloudbase',
  env: import.meta.env.VITE_CLOUDBASE_ENV_ID || 'ican2026-d6ghzjuxqc7487fde',
  region: 'ap-shanghai',
  accessKey: import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY || 'YOUR_CLOUDBASE_PUBLISHABLE_KEY',
};
