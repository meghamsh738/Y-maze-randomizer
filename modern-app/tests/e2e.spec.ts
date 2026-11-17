import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

test('generate, review, save and reopen a reproducible schedule', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('ymaze-preset-select')).toHaveValue('standard-learning-reversal')
  await page.getByLabel('Use Example Data').check()

  await page.getByTestId('ymaze-seed-toggle').check()
  await page.getByTestId('ymaze-seed-input').fill('73')
  await page.getByTestId('ymaze-max-repeats-input').fill('1')
  await page.getByLabel('Lock exit arm for A1').selectOption('3')
  await page.getByTestId('generate-btn').click()

  await expect(page.getByText('Exit Arm Assignments')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('ymaze-schedule-seed')).toHaveText('Seed 73')
  await expect(page.getByTestId('ymaze-review-lock-btn')).toBeEnabled()
  await expect(page.getByTestId('ymaze-export-excel-btn')).toBeDisabled()
  await expect(page.locator('[data-testid="ymaze-assignment-table"]')).toContainText('A1')
  await expect(page.locator('[data-testid="ymaze-assignment-table"]').getByText('Locked')).toBeVisible()

  const dayTable = page.locator('[data-testid="ymaze-day-table"]')
  const firstVersion = await dayTable.innerText()
  const tableRows = await dayTable.locator('tbody tr').all()
  for (const row of tableRows) {
    const cells = await row.locator('td').allInnerTexts()
    const trialArms = cells.slice(6).map(Number)
    for (let index = 1; index < trialArms.length; index += 1) {
      expect(trialArms[index]).not.toBe(trialArms[index - 1])
    }
  }

  await page.getByTestId('generate-btn').click()
  await expect(dayTable).toHaveText(firstVersion)
  await page.getByTestId('ymaze-review-lock-btn').click()
  await expect(page.getByTestId('ymaze-review-lock-btn')).toHaveText('Reviewed and locked')
  await expect(page.getByTestId('ymaze-export-excel-btn')).toBeEnabled()

  const excelDownload = page.waitForEvent('download')
  await page.getByTestId('ymaze-export-excel-btn').click()
  expect((await excelDownload).suggestedFilename()).toBe('ymaze_reviewed_schedule.xlsx')

  const packageDownload = page.waitForEvent('download')
  await page.getByTestId('ymaze-download-package-btn').click()
  const download = await packageDownload
  const packagePath = await download.path()
  expect(packagePath).not.toBeNull()
  const savedRun = JSON.parse(readFileSync(packagePath!, 'utf8'))
  expect(savedRun.reviewed).toBe(true)
  expect(savedRun.schedule.seed).toBe(73)
  expect(savedRun.schedule.locked_exit_arms.A1).toBe(3)
  expect(savedRun.schedule.day_tables.length).toBe(5)

  await page.getByLabel('Open saved Y-maze run package').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: readFileSync(packagePath!),
  })
  await expect(page.getByTestId('ymaze-review-lock-btn')).toHaveText('Reviewed and locked')
  await expect(page.getByTestId('ymaze-schedule-seed')).toHaveText('Seed 73')

  await page.getByTestId('ymaze-preset-name-input').fill('Repeat limited pilot')
  await page.getByTestId('ymaze-save-preset-btn').click()
  await expect(page.getByTestId('ymaze-preset-select')).toHaveValue(/custom-/)
})

test('input edits require a fresh schedule review', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Use Example Data').check()
  await page.getByTestId('generate-btn').click()
  await page.getByTestId('ymaze-review-lock-btn').click()
  await expect(page.getByTestId('ymaze-export-excel-btn')).toBeEnabled()

  await page.getByTestId('ymaze-reversal-days-input').fill('3')
  await expect(page.getByRole('status').filter({ hasText: 'Inputs changed.' })).toBeVisible()
  await expect(page.getByTestId('ymaze-export-excel-btn')).toBeDisabled()
})

test('warns when exact CSV values may be interpreted as spreadsheet formulas', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Animal data input').fill([
    'AnimalID,Tag,Sex,Genotype,Cage',
    '=1+1,+tag,M,@WT,Cage1',
    '0002,"tag, ""quoted""",F,-KO,Cage1',
    'A3,tag3,M,WT,Cage2',
    'A4,tag4,F,KO,Cage2',
  ].join('\n'))
  await page.getByTestId('generate-btn').click()
  await expect(page.getByTestId('ymaze-schedule-seed')).toContainText('Seed ', { timeout: 15_000 })
  await page.getByTestId('ymaze-review-lock-btn').click()
  await expect(page.getByRole('note')).toContainText('import columns as text')
})
