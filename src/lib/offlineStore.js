import { openDB } from 'idb';

const DB_NAME = 'SurveyOS_Field_Vault';
const STORE_NAME = 'mutation_queue';

export const initDB = async () => {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

// Queue an action (Photo upload, Point store, Toggle checklist)
export const vaultAction = async (actionType, payload) => {
  const db = await initDB();
  return db.add(STORE_NAME, {
    actionType,
    payload,
    status: 'pending',
    timestamp: new Date().toISOString()
  });
};

export const getVaultQueue = async () => {
  const db = await initDB();
  return db.getAll(STORE_NAME);
};

export const removeFromVault = async (id) => {
  const db = await initDB();
  return db.delete(STORE_NAME, id);
};