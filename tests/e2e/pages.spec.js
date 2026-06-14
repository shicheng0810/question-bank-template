// 方案乙站点 e2e：静态目录页 + 单文件全平铺播放器（docs/，由 build-pages.mjs 生成）。
import { expect, test } from '@playwright/test';

// 播放器功能测试默认跳过新手教程（教程本身有专门用例）
async function dismissTutorial(page) {
  await page.addInitScript(() => {
    localStorage.setItem('qb_tutorial_done_v1', '1');
  });
}

test('catalog lists merged entry + deployable banks and links to their players', async ({ page }) => {
  await page.goto('/');

  // 数据驱动：卡片应与站点清单一一对应（含合并库、含加密库）
  const manifest = await page.evaluate(() => fetch('banks/index.json').then((r) => r.json()));
  const cards = page.getByTestId('bank-card');
  await expect(cards).toHaveCount(manifest.length);

  const allBanks = manifest.find((e) => e.id === 'all-banks');
  const merged = cards.nth(0);
  await expect(merged).toHaveAttribute('href', 'player.html?bank=all-banks');
  await expect(merged).toContainText('Merged Practice'); // 默认英文
  await expect(merged).toContainText(`${allBanks.question_count} questions`);

  const amt = cards.nth(1);
  await expect(amt).toContainText('AMT205');
  await expect(amt).toHaveAttribute('href', 'player.html?bank=amt205');

  // 加密库卡片显示 🔒 徽章
  for (const e of manifest.filter((x) => x.mode === 'protected')) {
    await expect(page.locator(`[data-bank-id="${e.id}"]`)).toContainText('Protected');
  }
});

test('catalog language switcher shares the preference with player pages', async ({ page }) => {
  await dismissTutorial(page);
  await page.goto('/');

  await expect(page.locator('h1')).toHaveText('AMT Question Bank Practice');
  await page.locator('#ui-lang').selectOption('zh');
  await expect(page.locator('h1')).toHaveText('AMT 题库练习');
  await expect(page.getByTestId('bank-card').nth(0)).toContainText('合并练习');
  await expect(page.getByTestId('bank-card').nth(0)).toContainText('题'); // 数量随数据走

  // 同一偏好直通做题页
  await page.goto('/player.html?bank=amt205');
  await expect(page.locator('#btn-random')).toHaveText('打乱并重置');
});

test('? button reopens the tutorial on demand', async ({ page }) => {
  await dismissTutorial(page); // 已看过教程的状态
  await page.goto('/player.html?bank=amt205');
  await expect(page.getByTestId('qb-tutorial')).toBeHidden();

  await page.getByTestId('tutorial-help-btn').click();
  await expect(page.getByTestId('qb-tutorial')).toBeVisible();
  await expect(page.getByTestId('qb-tutorial')).toContainText('Welcome');

  await page.getByTestId('tutorial-skip-btn').click();
  await expect(page.getByTestId('qb-tutorial')).toBeHidden();
});

test('bank player renders every question flat; Random 150 hidden when scope <= 150', async ({ page }) => {
  await dismissTutorial(page);
  await page.goto('/player.html?bank=amt205');

  const cards = page.locator('.question-card');
  await expect(cards).toHaveCount(133);

  // 页面大标题 = 题库名（与目录卡片一致）
  await expect(page.locator('#quizApp h1')).toHaveText('AMT205 – Aircraft Coverings');

  // 133 < 150：Random 150 双按钮隐藏
  await expect(page.locator('#btn-random150')).toBeHidden();
  await expect(page.locator('#btn-back150')).toBeHidden();

  // 第一题：选第一个选项 → 提交 → 出判定（默认英文 UI）
  const firstCard = cards.nth(0);
  await firstCard.locator('.choice-btn').first().click();
  await firstCard.locator('button.submit-btn').click();
  await expect(firstCard.locator('button.submit-btn')).toHaveText('Submitted');

  await expect(page.locator('#btn-wrong')).toBeVisible();
  await expect(page.locator('#btn-star')).toBeVisible();

  // 站点模式有「返回目录」，点击回到目录页
  await page.getByTestId('back-catalog-link').click();
  await expect(page).toHaveURL(/\/(index\.html)?$/);
  await expect(page.getByTestId('bank-card').first()).toBeVisible();
});

test('merged all-banks player: bank selection dialog, full + subset merge, Random 150', async ({ page }) => {
  await dismissTutorial(page);
  await page.goto('/player.html?bank=all-banks');

  const manifest = await page.evaluate(() => fetch('banks/index.json').then((r) => r.json()));
  const publicEntries = manifest.filter((e) => e.mode !== 'protected' && e.id !== 'all-banks');
  const protectedEntries = manifest.filter((e) => e.mode === 'protected');
  const allBanksCount = manifest.find((e) => e.id === 'all-banks').question_count;

  // ① 选择对话框：公开库默认全勾选，加密库列出待解锁
  const dialog = page.getByTestId('qb-allbanks');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('ab-public-check')).toHaveCount(publicEntries.length);
  for (const e of publicEntries) await expect(dialog).toContainText(e.title);
  for (const e of protectedEntries) await expect(dialog).toContainText(e.title);

  // ② 全选直接开始 → 等于全部公开合并量
  await page.getByTestId('allbanks-start-btn').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.question-card')).toHaveCount(allBanksCount);
  await expect(page.locator('#btn-random150')).toBeVisible();
  const filterLabels = page.locator('#filter-container .filter-label');
  expect(await filterLabels.count()).toBeGreaterThan(1);

  // ③ 子集选择：刷新后只勾第一个公开库 → 数量 = 该库题数
  await page.reload();
  await expect(dialog).toBeVisible();
  for (const e of publicEntries.slice(1)) {
    await page.locator(`[data-ab-pub][value="${e.id}"]`).uncheck();
  }
  await page.getByTestId('allbanks-start-btn').click();
  await expect(page.locator('.question-card')).toHaveCount(publicEntries[0].question_count);

  // ④ 一个都不选 → 提示至少选一个
  await page.reload();
  await expect(dialog).toBeVisible();
  for (const e of publicEntries) await page.locator(`[data-ab-pub][value="${e.id}"]`).uncheck();
  await page.getByTestId('allbanks-start-btn').click();
  await expect(page.locator('#ab-msg')).toBeVisible();
  await expect(dialog).toBeVisible();
});

test('first visit shows the English tutorial; Skip dismisses it permanently', async ({ page }) => {
  await page.goto('/player.html?bank=amt205');

  const tutorial = page.getByTestId('qb-tutorial');
  await expect(tutorial).toBeVisible();
  await expect(tutorial).toContainText('Welcome');
  await expect(page.getByTestId('tutorial-next-btn')).toHaveText('Next');

  // 第 5 步是专门的 Star 介绍（高亮题卡上的 ☆）
  for (let i = 0; i < 4; i++) await page.getByTestId('tutorial-next-btn').click();
  await expect(tutorial).toContainText('Star questions');
  await expect(tutorial).toContainText('Star Only');

  await page.getByTestId('tutorial-skip-btn').click();
  await expect(tutorial).toBeHidden();

  await page.reload();
  await expect(page.locator('.question-card').first()).toBeVisible();
  await expect(page.getByTestId('qb-tutorial')).toBeHidden();
});

test('language switcher changes UI chrome but never the question content', async ({ page }) => {
  await dismissTutorial(page);
  await page.goto('/player.html?bank=amt205');

  const firstStem = await page.locator('.question-card .question-text').first().textContent();
  await expect(page.locator('#btn-random')).toHaveText('Randomize + Reset'); // 默认英文

  await page.locator('#ui-lang').selectOption('zh');
  await expect(page.locator('#btn-random')).toHaveText('打乱并重置');
  await expect(page.getByTestId('guide-open-btn')).toHaveText('页面按钮说明');
  // 题目本身不翻译
  expect(await page.locator('.question-card .question-text').first().textContent()).toBe(firstStem);

  // Button Guide 弹窗：点开 → 内容随语言 → 点遮罩关闭
  await page.getByTestId('guide-open-btn').click();
  await expect(page.getByTestId('qb-guide')).toBeVisible();
  await expect(page.locator('#guide-list')).toContainText('打乱并重置');
  await page.getByTestId('guide-close-btn').click();
  await expect(page.getByTestId('qb-guide')).toBeHidden();

  await page.locator('#ui-lang').selectOption('es');
  await expect(page.locator('#btn-random')).toHaveText('Mezclar y reiniciar');

  // 语言偏好跨刷新保留
  await page.reload();
  await expect(page.locator('#btn-random')).toHaveText('Mezclar y reiniciar');
});

test('local JSON import: practice a hand-written bank entirely in the browser', async ({ page }) => {
  await dismissTutorial(page);
  await page.goto('/');

  await expect(page.getByTestId('format-link')).toHaveAttribute('href', 'format.html');
  await page.getByTestId('import-file').setInputFiles('tests/fixtures/local-import-sample.json');
  await expect(page.getByTestId('import-msg')).toContainText('3 questions');

  const card = page.getByTestId('local-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('local-import-sample');
  await expect(card).toContainText('Local');

  await card.getByTestId('local-practice-link').click();
  await expect(page).toHaveURL(/local\.html\?bank=local-import-sample/);
  await expect(page.locator('.question-card')).toHaveCount(3);

  // 播放器会打乱顺序，取第一张「选择题」卡（填空卡没有选项按钮）
  const choiceCard = page.locator('.question-card').filter({ has: page.locator('.choice-btn') }).first();
  await choiceCard.locator('.choice-btn').first().click();
  await choiceCard.locator('button.submit-btn').click();
  await expect(choiceCard.locator('button.submit-btn')).toHaveText('Submitted');

  // 本地题库也有独立存储命名空间
  const ns = await page.evaluate(() => localStorage.getItem('local-local-import-sample_attempt_count_map_v1'));
  expect(ns).toBeTruthy();
});

test('format guide documents the JSON schema bilingually', async ({ page }) => {
  await page.goto('/format.html');
  await expect(page.locator('h1')).toContainText('JSON Format');
  await expect(page.locator('pre')).toContainText('"answers": [0, 2]');
  await expect(page.locator('body')).toContainText('忽略大小写');
});

test('per-bank storage namespaces keep banks isolated on the same origin', async ({ page }) => {
  await dismissTutorial(page);
  await page.goto('/player.html?bank=amt205');
  const firstCard = page.locator('.question-card').nth(0);
  await firstCard.locator('.choice-btn').first().click();
  await firstCard.locator('button.submit-btn').click();
  await expect(firstCard.locator('button.submit-btn')).toHaveText('Submitted');

  const amtKeys = await page.evaluate(() => ({
    attempts: localStorage.getItem('amt205_attempt_count_map_v1'),
    legacyAttempts: localStorage.getItem('amt_attempt_count_map_v1'),
  }));
  expect(amtKeys.attempts).toBeTruthy();
  expect(amtKeys.legacyAttempts).toBeNull();

  await page.goto('/player.html?bank=wood-structures');
  await expect(page.locator('.question-card').first()).toBeVisible();
  const after = await page.evaluate(() => localStorage.getItem('amt205_attempt_count_map_v1'));
  expect(after).toBe(amtKeys.attempts);

  await page.goto('/');
  const progress = page.locator('[data-progress-for="amt205"]');
  await expect(progress).toHaveText(/1 practiced/); // 默认英文
});
