import { validateImageString } from '@/modules/workspaces/helpers/images'
import { expectToThrow } from '@/test/assertionHelper'

describe('validateImageString', () => {
  describe('a valid base64 encoded image', () => {
    const image =
      'data:image/jpeg;base64,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'
    it('should pass', () => {
      validateImageString(image)
    })
  })

  describe('an image above the size limit', () => {
    it('should fail', async () => {
      await expectToThrow(() =>
        validateImageString('especkle'.repeat(10 * 1024 * 1024))
      )
    })
  })

  describe('a string not encoded in base64', () => {
    it('should fail', async () => {
      await expectToThrow(() => validateImageString('👈😔👉'))
    })
  })
})