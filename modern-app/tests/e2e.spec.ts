import { test, expect } from '@playwright/test'

test('example schedule generation', async ({ page }) => {
  await page.goto('/')
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })

  await page.getByLabel('Use Example Data').check()
  await page.getByTestId('generate-btn').click()

  await expect(page.getByText('Exit Arm Assignments')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Day 1/ })).toBeVisible()

  await expect(page).toHaveScreenshot('example_run.png', { fullPage: true })
})
