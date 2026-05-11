import { expect, test } from '@playwright/test';

async function seedSiteRuntime(page) {
  await page.addInitScript(() => {
    window.__QB_TEST__ = {
      seed: 7,
      now: 1744848000000,
      random150Limit: 2,
    };
  });
}

test('catalog filters and locale persistence work across reloads', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/');

  const manifestCounts = await page.evaluate(async () => {
    const manifest = await fetch('banks/index.json').then((response) => response.json());
    return {
      total: manifest.length,
      protectedTotal: manifest.filter((entry) => entry.mode === 'protected').length,
    };
  });

  await expect(page.getByTestId('catalog-card')).toHaveCount(manifestCounts.total);

  await page.getByTestId('catalog-mode').selectOption('protected');
  await expect(page.getByTestId('catalog-card')).toHaveCount(manifestCounts.protectedTotal);

  await page.getByTestId('catalog-clear-btn').click();
  await expect(page.getByTestId('catalog-card')).toHaveCount(manifestCounts.total);

  await page.getByTestId('site-locale-select').selectOption('es');
  await expect(page.getByTestId('global-focus-btn')).toHaveText(/Modo enfoque/i);

  await page.reload();
  await expect(page.getByTestId('global-focus-btn')).toHaveText(/Modo enfoque/i);

  await page.getByTestId('site-locale-select').selectOption('zh');
  await expect(page.getByTestId('global-focus-btn')).toHaveText(/专注模式/);
});

test('public bank supports practice, focus mode, filtering, image preview, exam summary, and session restore', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/?bank=sample-public');

  await expect(page.getByTestId('player-view')).toBeVisible();
  await expect(page.getByTestId('question-text')).toContainText('routine inspection');

  await page.getByTestId('choice-button').nth(0).click();
  await page.getByTestId('submit-question-btn').click();
  await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-feedback-kind', 'correct');

  await page.getByTestId('next-question-btn').click();
  await expect(page.getByTestId('pager-meta')).toHaveText('2 / 5');

  await page.reload();
  await expect(page.getByTestId('pager-meta')).toHaveText('2 / 5');

  await page.getByTestId('global-focus-btn').click();
  await expect(page.locator('body')).toHaveClass(/focus-mode/);
  await page.getByTestId('global-focus-btn').click();
  await expect(page.locator('body')).not.toHaveClass(/focus-mode/);

  await page.getByTestId('question-search').fill('diagram');
  await expect(page.getByTestId('question-text')).toContainText('diagram highlights');
  await expect(page.getByTestId('question-image')).toHaveCount(1);

  await page.getByTestId('question-image').click();
  await expect(page.getByTestId('image-lightbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('image-lightbox')).toBeHidden();

  await page.getByTestId('reset-filters-btn').click();
  await page.getByTestId('exam-count-select').selectOption('10');
  await page.getByTestId('mode-btn-exam').click();
  await expect(page.getByTestId('finish-exam-btn')).toBeVisible();
  await page.getByTestId('finish-exam-btn').click();
  await expect(page.getByTestId('exam-summary')).toBeVisible();
  await expect(page.getByTestId('retry-wrong-btn')).toBeVisible();
});

test('public bank preserves legacy inline fill blanks and auto submit', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/?bank=sample-public');

  await page.getByTestId('next-question-btn').click();
  await page.getByTestId('next-question-btn').click();

  await expect(page.getByTestId('question-card')).toHaveAttribute('data-question-type', 'fill');
  await expect(page.getByTestId('inline-fill-input')).toHaveCount(1);
  await expect(page.getByTestId('fill-area')).toBeHidden();

  await page.getByTestId('auto-submit-toggle').click();
  await page.getByTestId('inline-fill-input').fill('check list');

  await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-feedback-kind', 'correct');
});

test('wrong practice answers stay in review until explicitly removed', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/?bank=sample-public');

  await page.getByTestId('choice-button').nth(1).click();
  await page.getByTestId('submit-question-btn').click();
  await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-feedback-kind', 'wrong');
  await expect(page.getByTestId('review-stat')).toHaveText('0 / 1');

  await page.getByTestId('redo-question-btn').click();
  await page.getByTestId('choice-button').nth(0).click();
  await page.getByTestId('submit-question-btn').click();
  await expect(page.getByTestId('feedback-panel')).toHaveAttribute('data-feedback-kind', 'correct');
  await expect(page.getByTestId('review-stat')).toHaveText('0 / 1');

  await page.getByTestId('mode-btn-wrong').click();
  await expect(page.getByTestId('question-text')).toContainText('routine inspection');
  await page.getByTestId('remove-wrong-btn').click();
  await expect(page.getByTestId('review-stat')).toHaveText('0 / 0');
});

test('Random 150 mode uses the configured practice limit and can return to the active draw', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/?bank=sample-public');

  await page.getByTestId('mode-btn-random150').click();
  await expect(page.getByTestId('player-view')).toHaveAttribute('data-mode', 'random150');
  await expect(page.getByTestId('pager-meta')).toHaveText('1 / 2');

  await page.getByTestId('mode-btn-all').click();
  await expect(page.getByTestId('pager-meta')).toHaveText('1 / 5');

  await page.getByTestId('random150-current-btn').click();
  await expect(page.getByTestId('player-view')).toHaveAttribute('data-mode', 'random150');
  await expect(page.getByTestId('pager-meta')).toHaveText('1 / 2');
});

test('protected bank enforces password flow and session-only password reuse', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/?bank=demo-protected');

  await expect(page.getByTestId('password-modal')).toBeVisible();
  await page.getByTestId('submit-password-btn').click();
  await expect(page.getByTestId('password-error')).toBeVisible();

  await page.getByTestId('password-input').fill('wrong-pass');
  await page.getByTestId('submit-password-btn').click();
  await expect(page.getByTestId('password-error')).toContainText(/decrypt|解密|descifrar|密码/i);

  await page.getByTestId('password-input').fill('sample-pass');
  await page.getByTestId('remember-password-input').check();
  await page.getByTestId('submit-password-btn').click();

  await expect(page.getByTestId('player-view')).toBeVisible();
  await expect(page.getByTestId('password-modal')).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('player-view')).toBeVisible();
  await expect(page.getByTestId('password-modal')).toBeHidden();
});

test('canceling a protected bank prompt returns to the catalog route', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.goto('/?bank=demo-protected');

  await expect(page.getByTestId('password-modal')).toBeVisible();
  await page.getByTestId('cancel-password-btn').click();

  await expect(page.getByTestId('password-modal')).toBeHidden();
  await expect(page.getByTestId('catalog-view')).toBeVisible();
  await expect(page).toHaveURL(/\/(?:index\.html)?$/);
});

test('corrupted local storage payloads do not block bank recovery', async ({ page }) => {
  await seedSiteRuntime(page);
  await page.addInitScript(() => {
    localStorage.setItem('qb:sample-public:v1:starred', JSON.stringify({ nope: true }));
    localStorage.setItem('qb:sample-public:v1:wrong', JSON.stringify({ nope: true }));
    localStorage.setItem('qb:sample-public:v1:attempts', JSON.stringify(['bad']));
    localStorage.setItem('qb:sample-public:v1:prefs', JSON.stringify(['bad']));
    localStorage.setItem('amt_starred_questions', JSON.stringify({ bad: true }));
    localStorage.setItem('amt_wrong_questions', JSON.stringify({ bad: true }));
    localStorage.setItem('amt_attempt_count_map_v1', JSON.stringify(['bad']));
  });

  await page.goto('/?bank=sample-public');

  await expect(page.getByTestId('player-view')).toBeVisible();
  await expect(page.getByTestId('question-text')).toContainText('routine inspection');
});
