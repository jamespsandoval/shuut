// Short-lived, account-scoped browser drafts prevent a page reload from losing
// a stopped recording. Drafts are never published without an explicit submit.
export type VoiceDraft = {
  ownerId: string
  audio: Blob
  durationSeconds: number
  audioObjectPath: string | null
  transcript: string
  pendingRawTranscript: string | null
  rawAccepted: boolean
  savedAt: number
}

const DATABASE = "shuut-voice-draft"
const STORE = "drafts"
const MAX_AGE_MS = 24 * 60 * 60 * 1000

let operations: Promise<unknown> = Promise.resolve()

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation, operation)
  operations = result.then(() => undefined, () => undefined)
  return result
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transact<T>(
  mode: IDBTransactionMode,
  requestFor: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode)
    const request = requestFor(transaction.objectStore(STORE))
    let result: T
    request.onsuccess = () => { result = request.result }
    transaction.oncomplete = () => { database.close(); resolve(result) }
    transaction.onerror = () => { database.close(); reject(transaction.error) }
    transaction.onabort = () => { database.close(); reject(transaction.error) }
  })
}

export function saveVoiceDraft(draft: VoiceDraft): Promise<void> {
  return serialize(async () => {
    await transact("readwrite", (store) => store.put(draft, draft.ownerId))
  })
}

export function discardVoiceDraft(ownerId: string): Promise<void> {
  return serialize(async () => {
    await transact("readwrite", (store) => store.delete(ownerId))
  })
}

export function loadVoiceDraft(ownerId: string): Promise<VoiceDraft | null> {
  return serialize(async () => {
    const drafts = await transact("readonly", (store) => store.getAll() as IDBRequest<VoiceDraft[]>)
    for (const draft of drafts) {
      if (Date.now() - draft.savedAt > MAX_AGE_MS) {
        await transact("readwrite", (store) => store.delete(draft.ownerId))
      }
    }
    return drafts.find((draft) => draft.ownerId === ownerId && Date.now() - draft.savedAt <= MAX_AGE_MS) ?? null
  })
}