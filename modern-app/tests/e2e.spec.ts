import { test, expect } from '@playwright/test'
import { promises as fs } from 'fs'

test('example schedule generation', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Use Example Data').check()
  await page.getByTestId('generate-btn').click()

  await expect(page.getByText('Exit Arm Assignments')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Day 1/ })).toBeVisible()

  await fs.mkdir('screenshots', { recursive: true })
  await page.screenshot({ path: 'screenshots/example_run.png', fullPage: true })
})
