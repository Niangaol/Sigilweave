// 统一浏览器入口：优先用 CDP 连接（沙箱里 Playwright 直接 launch 会因命名管道 EPERM）。
// PW_CDP_URL 存在时连已启动的 Edge；否则退回常规 launch。
import { chromium } from 'playwright';

export async function openBrowser() {
  const cdp = process.env.PW_CDP_URL;
  const channel = process.env.PW_CHANNEL ?? 'msedge';
  if (!cdp) return chromium.launch({ channel });

  const browser = await chromium.connectOverCDP(cdp);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const ctxNewPage = context.newPage.bind(context);
  // connectOverCDP 的 browser 没有 newPage，这里补一个，行为与 launch 版本一致。
  browser.newPage = async (opts = {}) => {
    const page = await ctxNewPage();
    if (opts.viewport) await page.setViewportSize(opts.viewport);
    return page;
  };
  return browser;
}
