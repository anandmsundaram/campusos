/**
 * Auth setup — verifies that the saved storage states are valid.
 * This runs as the "setup" project before all chromium specs.
 * The actual user creation happens in global-setup.ts.
 */

import { test as setup, expect } from '@playwright/test'
import { storageStatePath } from '../helpers/auth'
import fs from 'fs'

setup('auth states exist', async () => {
  for (const [name, filePath] of Object.entries(storageStatePath)) {
    expect(
      fs.existsSync(filePath),
      `Auth state missing for ${name}. Did global-setup run successfully? Check playwright/.auth/${name}.json`
    ).toBe(true)
  }
})
