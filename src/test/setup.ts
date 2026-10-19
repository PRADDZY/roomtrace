import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
}

if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    value(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(this)
      })
    },
  })
}

let objectUrlNumber = 0
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: () => `blob:roomtrace-test-${++objectUrlNumber}`,
})
Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
